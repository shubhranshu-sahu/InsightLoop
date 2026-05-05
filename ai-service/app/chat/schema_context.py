"""
InsightLoop AI Service — Form Schema Context Builder
=====================================================
Builds the FORM CONTEXT block that is injected into every LLM system prompt.

Why does the LLM need form context?
  The LLM has no idea what feedback form is being discussed. Without context
  it can only give generic answers. With form context it knows:
    - What questions the form has (label + type)
    - What AI-derived fields exist per response (sentiment, urgency, etc.)
    - How many responses have been collected so far

  Example — without context the LLM might say "I don't know what questions
  your form has." With context it says "Your form has 6 questions including
  2 text questions about improvements and enjoyment..."

Data sources (two-tier with fallback):
  Tier 1 — MySQL (preferred):
    SELECT question_id, question_text, type FROM questions WHERE form_id = ?
    Fast and authoritative. Also reads form title from forms table.

  Tier 2 — MongoDB fallback (when MySQL is unavailable):
    Read the last 5 responses for this form_id from the responses collection.
    Each response carries a self-describing answers map:
      { "q1": { "label": "...", "type": "...", "value": ... } }
    Deduplicate keys → reconstruct the question list.

In-memory cache:
  Building schema context requires a DB query. We cache the result per
  form_id for SCHEMA_CONTEXT_CACHE_TTL seconds (default: 5 minutes).
  This means the first message in a conversation triggers a DB query,
  but subsequent messages in the same session use the cached string.
  Cache is per-process (not Redis) — fine for a single-instance service.
"""

import time
from datetime import datetime, timezone

from app.config import settings
from app.db.mongo import get_db


# ── In-memory cache ───────────────────────────────────────────────────────────
# dict mapping form_id → (schema_string, expiry_unix_timestamp)
# This is a simple module-level dict — works perfectly for a single process.
_schema_cache: dict[str, tuple[str, float]] = {}


# ── Public API ────────────────────────────────────────────────────────────────


async def get_form_schema(form_id: str, business_id: str) -> str:
    """
    Get the form schema context string for the given form.

    Checks the in-memory cache first. If expired or missing, queries
    MySQL (Tier 1) or MongoDB (Tier 2 fallback) and rebuilds the string.

    Args:
        form_id:     UUID of the feedback form.
        business_id: UUID of the business (for MongoDB query scoping).

    Returns:
        str: Multi-line schema context string ready to be inserted into the
             LLM system prompt. Never returns None — always returns at least
             a generic fallback string.
    """
    # ── Cache check ───────────────────────────────────────────────────────────
    cached = _schema_cache.get(form_id)
    if cached is not None:
        schema_str, expires_at = cached
        if time.time() < expires_at:
            return schema_str  # Cache hit — return immediately
        # Cache expired — fall through and rebuild

    # ── Tier 1: MySQL ────────────────────────────────────────────────────────
    try:
        schema_str = await _build_from_mysql(form_id)
    except (NotImplementedError, Exception):
        # MySQL not configured (NotImplementedError) or connection failed.
        # Fall through silently to MongoDB fallback.
        schema_str = None

    # ── Tier 2: MongoDB fallback ──────────────────────────────────────────────
    if schema_str is None:
        try:
            schema_str = await _build_from_mongodb(form_id, business_id)
        except Exception:
            # Both tiers failed — return generic context so the LLM can still help
            schema_str = _generic_fallback(form_id)

    # ── Cache and return ──────────────────────────────────────────────────────
    expiry = time.time() + settings.SCHEMA_CONTEXT_CACHE_TTL
    _schema_cache[form_id] = (schema_str, expiry)
    return schema_str


def invalidate_cache(form_id: str) -> None:
    """
    Remove a form's schema from the cache.

    Call this if the form's questions change (e.g. after a question is added).
    Currently not called automatically — available for future use.

    Args:
        form_id: UUID of the form whose cache entry should be removed.
    """
    _schema_cache.pop(form_id, None)


# ── Private helpers ───────────────────────────────────────────────────────────


async def _build_from_mysql(form_id: str) -> str:
    """
    Build schema context string by querying MySQL.

    Queries two tables:
      - forms: to get the form title and creation date
      - questions: to get all questions for this form

    Args:
        form_id: UUID of the form.

    Returns:
        str: Formatted schema context string.

    Raises:
        NotImplementedError: If MySQL pool is not initialized (propagates to caller).
        Exception: On any MySQL connection/query error (propagates to caller).
    """
    from app.db.mysql import get_mysql_pool  # noqa: PLC0415
    #(no quality assurance warning) noqa: PLC0415 is just silencing a style warning about importing in a non-standard place.

    # get_mysql_pool() raises NotImplementedError if MySQL is not configured.
    # This propagates up to get_form_schema() which catches it.
    pool = await get_mysql_pool()

    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # Get form title and response count context
            await cur.execute(
                "SELECT title FROM feedback_forms WHERE form_id = %s LIMIT 1",
                (form_id,),
            )
            form_row = await cur.fetchone()
            form_title = form_row[0] if form_row else "Feedback Form"

            # Get all questions for this form, ordered by position
            await cur.execute(
                """
                SELECT question_id, question_text, type
                FROM questions
                WHERE form_id = %s
                ORDER BY position ASC
                """,
                (form_id,),
            )
            rows = await cur.fetchall()

    # Build question lines
    question_lines = []
    for row in rows:
        qid, qtext, qtype = row
        type_label = _format_type_label(qtype)
        question_lines.append(f"  [{qid}]  {type_label}: \"{qtext}\"")

    # Get response count from MongoDB (MySQL doesn't have this)
    db = await get_db()
    response_count = await db.responses.count_documents(
        {"form_id": form_id, "ai_analysis.status": "done"}
    )

    return _format_schema_string(
        form_title=form_title,
        response_count=response_count,
        question_lines=question_lines,
    )


async def _build_from_mongodb(form_id: str, business_id: str) -> str:
    """
    Build schema context string from MongoDB responses (MySQL fallback).

    Reads the last 5 analyzed responses for this form. Each response carries
    a self-describing answers map with label and type per question. We
    deduplicate question IDs to reconstruct the question list.

    Why last 5 responses?
      One response is enough in theory, but 5 guards against edge cases where
      some questions are optional and not answered in every response.

    Args:
        form_id:     UUID of the form.
        business_id: UUID of the business (for query scoping).

    Returns:
        str: Formatted schema context string. May have fewer questions than the
             real form if optional questions weren't answered in the last 5 responses.
    """
    db = await get_db()

    # Fetch last 5 fully analyzed responses for this form
    cursor = db.responses.find(
        {"form_id": form_id, "business_id": business_id, "ai_analysis.status": "done"},
        {"answers": 1},  # Only fetch the answers field
    ).sort("submitted_at", -1).limit(5)

    responses = await cursor.to_list(length=5)

    # Deduplicate questions across all responses
    # Use an OrderedDict-like approach: first-seen order preserved by insertion order of dict
    seen_questions: dict[str, dict] = {}  # question_id → {label, type}
    for response in responses:
        for qid, ans in response.get("answers", {}).items():
            if qid not in seen_questions:
                seen_questions[qid] = {
                    "label": ans.get("label", "Unknown question"),
                    "type":  ans.get("type", "text"),
                }

    # Build question lines
    question_lines = []
    for qid, info in seen_questions.items():
        type_label = _format_type_label(info["type"])
        question_lines.append(f"  [{qid}]  {type_label}: \"{info['label']}\"")

    # Response count
    response_count = await db.responses.count_documents(
        {"form_id": form_id, "ai_analysis.status": "done"}
    )

    return _format_schema_string(
        form_title="Feedback Form",  # We don't have the title from MongoDB
        response_count=response_count,
        question_lines=question_lines,
        note="(Form title unavailable — MySQL not connected)",
    )


def _format_type_label(qtype: str) -> str:
    """
    Convert internal type string to a human-readable label for the prompt.

    Args:
        qtype: Internal type string (e.g. "rating", "text", "yesno").

    Returns:
        str: Human-readable label (e.g. "RATING (1-5)", "TEXT", "YES/NO").
    """
    mapping = {
        "rating": "RATING (1-5)",
        "text":   "TEXT",
        "yesno":  "YES/NO",
    }
    return mapping.get(qtype.lower(), qtype.upper())


def _format_schema_string(
    form_title: str,
    response_count: int,
    question_lines: list[str],
    note: str = "",
) -> str:
    """
    Assemble the final schema context string.

    This string is inserted into the system prompt between the role definition
    and the conversation rules. The LLM reads it to understand what data it
    has access to.

    Args:
        form_title:     Human-readable form name.
        response_count: Number of fully analyzed responses.
        question_lines: List of formatted question strings.
        note:           Optional note appended at the end (for fallback mode).

    Returns:
        str: Multi-line schema context block.
    """
    questions_block = (
        "\n".join(question_lines)
        if question_lines
        else "  (No questions found)"
    )

    lines = [
        f'Form: "{form_title}"',
        f"Total analyzed responses: {response_count}",
        "",
        "Questions:",
        questions_block,
        "",
        "AI-derived fields available per response:",
        "  overall_sentiment: positive | neutral | negative",
        "  urgency:           low | medium | high",
        "  is_complaint:      true | false",
        "  dominant_topic:    string (e.g. 'food temperature', 'wait time')",
        "  per text question: sentiment, topics, key_phrases, intent, emotions",
    ]

    if note:
        lines.append(f"\nNote: {note}")

    return "\n".join(lines)


def _generic_fallback(form_id: str) -> str:
    """
    Last-resort fallback when both MySQL and MongoDB are unavailable.

    Returns a minimal context string that lets the LLM at least know
    it's analyzing customer feedback, even without specific question details.

    Args:
        form_id: Form UUID (included for debugging context).

    Returns:
        str: Generic schema context string.
    """
    return (
        f'Form ID: {form_id}\n'
        "Form structure unavailable (database connection issue).\n\n"
        "AI-derived fields available per response:\n"
        "  overall_sentiment, urgency, is_complaint, dominant_topic"
    )
