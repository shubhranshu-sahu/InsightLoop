"""
InsightLoop AI Service — Node 2: derive_overall_node
=====================================================
LangGraph pipeline node that derives overall feedback metrics using
pure Python logic — zero LLM calls.

Responsibility:
    Combine signals from rating answers and text analysis results to produce:
    - overall_sentiment  ("positive" | "neutral" | "negative")
    - sentiment_score    (0.0 to 1.0 confidence)
    - urgency            ("low" | "medium" | "high")
    - is_complaint       (bool)
    - dominant_topic     (str — most mentioned topic across all text answers)

Input  (reads from state):
    state["answers"]            — to extract rating values
    state["per_text_analysis"]  — to read sentiment, intent, topics per text answer

Output (writes to state):
    state["overall_sentiment"]
    state["sentiment_score"]
    state["urgency"]
    state["is_complaint"]
    state["dominant_topic"]

LLM call count: 0
"""

from collections import Counter

from app.pipeline.state import FeedbackState


# ── Sentiment Derivation Logic ────────────────────────────────────────────────

def _derive_sentiment(avg_rating: float | None, text_analysis: dict) -> tuple[str, float]:
    """
    Derive overall_sentiment and sentiment_score from ratings + text sentiments.

    Logic:
        negative: avg_rating < 2.5  OR  more negative text answers than positive
        positive: avg_rating >= 4.0 AND  positive text answers >= negative
        neutral:  everything else

    The sentiment_score is a simple ratio:
        negative → neg_count / total_text_count  (or 0.6 if only ratings drove it)
        positive → pos_count / total_text_count  (or 0.6 if only ratings drove it)
        neutral  → 0.5 (balanced signal)

    Args:
        avg_rating:    Average of all rating answers. None if no rating questions.
        text_analysis: The per_text_analysis dict from Node 1.

    Returns:
        Tuple of (overall_sentiment, sentiment_score).
    """
    text_sentiments = [v.get("sentiment") for v in text_analysis.values()]
    neg_count = text_sentiments.count("negative")
    pos_count = text_sentiments.count("positive")
    total = max(len(text_sentiments), 1)  # avoid division by zero

    # Negative signal: low rating OR majority negative text
    if (avg_rating is not None and avg_rating < 2.5) or neg_count > pos_count:
        score = round(neg_count / total, 2) if text_sentiments else 0.6
        return "negative", max(score, 0.5)  # floor at 0.5 for clarity

    # Positive signal: high rating AND at least as many positive as negative
    if (avg_rating is not None and avg_rating >= 4.0) and pos_count >= neg_count:
        score = round(pos_count / total, 2) if text_sentiments else 0.6
        return "positive", max(score, 0.5)

    # Neutral: mixed or insufficient signal
    return "neutral", 0.5


# ── Urgency Derivation Logic ──────────────────────────────────────────────────

def _derive_urgency(
    overall_sentiment: str,
    has_complaint: bool,
    avg_rating: float | None,
) -> str:
    """
    Derive urgency from the combination of sentiment, complaint flag, and rating.

    Tiers:
        high   — negative overall AND complaint intent AND avg_rating <= 2
        medium — negative overall OR any complaint intent (but not both + low rating)
        low    — everything else

    Args:
        overall_sentiment: One of "positive" | "neutral" | "negative".
        has_complaint:     True if any text answer was classified as complaint.
        avg_rating:        Average rating across all rating questions. None if none exist.

    Returns:
        str: "low" | "medium" | "high"
    """
    rating_is_low = avg_rating is not None and avg_rating <= 2.0

    if overall_sentiment == "negative" and has_complaint and rating_is_low:
        return "high"
    if overall_sentiment == "negative" or has_complaint:
        return "medium"
    return "low"


# ── Node Function ─────────────────────────────────────────────────────────────


def derive_overall_node(state: FeedbackState) -> FeedbackState:
    """
    LangGraph Node 2 — Overall Derivation (rule-based, no LLM).

    Reads rating values from `answers` and NLP results from `per_text_analysis`,
    then computes the five overall fields using deterministic logic.

    Flow:
        1. Collect all rating values → compute average
        2. Collect text sentiments → count positive / negative
        3. Derive overall_sentiment + sentiment_score
        4. Check for any complaint intent → is_complaint
        5. Derive urgency from sentiment + complaint + rating
        6. Count all topics across text answers → dominant_topic
        7. Write all five fields to state

    Args:
        state: Current FeedbackState. Reads `answers` and `per_text_analysis`.

    Returns:
        Updated FeedbackState with overall fields populated.

    Note:
        This node is intentionally synchronous (not async) — no I/O.
        LangGraph supports both sync and async node functions.
    """
    answers = state["answers"]
    text_analysis = state.get("per_text_analysis", {})

    # Step 1 — Average rating
    ratings = [
        ans["value"]
        for ans in answers.values()
        if ans.get("type") == "rating" and isinstance(ans.get("value"), (int, float))
    ]
    avg_rating = sum(ratings) / len(ratings) if ratings else None

    # Step 2 + 3 — Overall sentiment + score
    overall_sentiment, sentiment_score = _derive_sentiment(avg_rating, text_analysis)

    # Step 4 — Complaint flag
    intents = [v.get("intent") for v in text_analysis.values()]
    has_complaint = "complaint" in intents

    # Step 5 — Urgency
    urgency = _derive_urgency(overall_sentiment, has_complaint, avg_rating)

    # Step 6 — Dominant topic
    all_topics: list[str] = []
    for v in text_analysis.values():
        all_topics.extend(v.get("topics", []))

    dominant_topic = Counter(all_topics).most_common(1)[0][0] if all_topics else "General"

    # Step 7 — Write to state
    state["overall_sentiment"] = overall_sentiment
    state["sentiment_score"] = sentiment_score
    state["urgency"] = urgency
    state["is_complaint"] = has_complaint
    state["dominant_topic"] = dominant_topic

    return state
