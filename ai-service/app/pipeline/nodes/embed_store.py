"""
InsightLoop AI Service — Node 4: embed_store_node
==================================================
LangGraph pipeline node that persists the processed feedback response
to the vector store (ChromaDB) and updates MongoDB.

This is the final node in the pipeline. It runs after all analysis and
summarization is complete, and its job is to make the results durable.

Responsibilities:
    1. Build a rich natural-language prose document from the full state
    2. Store it in ChromaDB (via LangChain VectorStore) with metadata
    3. Update MongoDB responses.ai_analysis via $set (status → "done")
    4. Set state["embedding_stored"] = True

Input  (reads from state): all fields — uses everything for the document
Output (writes to state):  state["embedding_stored"]

LLM call count: 0

Vector document design:
    The document is natural-language prose (not JSON) so that semantic
    similarity search works correctly. When a business owner asks
    "complaints about cold food", the model retrieves based on actual
    meaning, not keyword matching.

Metadata stored with each document in ChromaDB:
    response_id, form_id, business_id, submitted_at,
    overall_sentiment, urgency, is_complaint (as "true"/"false"),
    dominant_topic

    → response_id in metadata = source citation link for RAG chat (Phase 3)

MongoDB $set (ai_analysis block only — never touches answers):
    status, overall_sentiment, sentiment_score, urgency,
    is_complaint, dominant_topic, per_text_analysis, summary, processed_at
"""

from datetime import datetime, timezone

from langchain_core.documents import Document

from app.db.mongo import get_db
from app.pipeline.state import FeedbackState
from app.vector.store import get_vector_store


# ── Document Builder ──────────────────────────────────────────────────────────


def _build_vector_document(state: FeedbackState) -> str:
    """
    Build a natural-language prose document from the full pipeline state.

    Why prose and not JSON?
        Embedding models convert text to semantic vectors. Natural language
        prose creates better embeddings than raw JSON because it mimics
        the language a user would use when searching (e.g., "cold food complaint")
        — which semantically matches "biryani arrived cold" in the document.

    Args:
        state: Full FeedbackState after all nodes have run.

    Returns:
        str: Multi-line prose document ready to be embedded and stored.
    """
    answers = state["answers"]
    text_analysis = state.get("per_text_analysis", {})

    lines: list[str] = [
        f"Form: {state['form_id']}",
        f"Submitted: {state['submitted_at']}",
        "",
    ]

    # Ratings block
    for ans in answers.values():
        if ans.get("type") == "rating":
            lines.append(f"Rating — {ans['label']}: {ans['value']}/5")

    # Yes/No block
    for ans in answers.values():
        if ans.get("type") == "yesno":
            val = "Yes" if ans["value"] else "No"
            lines.append(f"{ans['label']}: {val}")

    lines.append("")

    # Text answers with analysis annotations
    for qid, analysis in text_analysis.items():
        label     = analysis.get("label", "")
        raw       = analysis.get("raw_answer", "")
        topics    = ", ".join(analysis.get("topics", []))
        phrases   = ", ".join(analysis.get("key_phrases", []))
        intent    = analysis.get("intent", "")
        sentiment = analysis.get("sentiment", "")

        lines.append(f"Q: {label}")
        lines.append(f'A: "{raw}"')
        lines.append(
            f"→ Sentiment: {sentiment} | Topics: {topics} | "
            f"Key phrases: {phrases} | Intent: {intent}"
        )
        lines.append("")

    # Overall summary line
    lines.append(
        f"Overall: {state.get('overall_sentiment', '')} | "
        f"Urgency: {state.get('urgency', '')} | "
        f"Complaint: {state.get('is_complaint', False)} | "
        f"Dominant topic: {state.get('dominant_topic', '')}"
    )

    if state.get("summary"):
        lines.append(f"Summary: {state['summary']}")

    return "\n".join(lines)


# ── Node Function ─────────────────────────────────────────────────────────────


async def embed_store_node(state: FeedbackState) -> FeedbackState:
    """
    LangGraph Node 4 — Embed & Store.

    Builds the prose document, stores it in ChromaDB, and updates MongoDB.
    This is the only node that performs persistent side-effects.

    Flow:
        1. Build prose document from full state
        2. Build metadata dict for ChromaDB and source citation
        3. Add Document to ChromaDB via LangChain VectorStore.add_documents()
        4. Update MongoDB responses collection via $set on ai_analysis block
        5. Set state["embedding_stored"] = True

    Args:
        state: Full FeedbackState after Node 1, 2, 3 have run.

    Returns:
        Updated FeedbackState with embedding_stored = True on success.

    Note:
        On failure, sets embedding_stored = False and propagates the exception
        to the route handler, which sets MongoDB status = "failed".
    """
    processed_at = datetime.now(timezone.utc)

    # Step 1 — Build prose document
    doc_text = _build_vector_document(state)

    # Step 2 — Build metadata
    # ChromaDB requires all metadata values to be str/int/float — no booleans.
    # is_complaint is stored as "true"/"false" string.
    metadata = {
        "response_id":       state["response_id"],
        "form_id":           state["form_id"],
        "business_id":       state["business_id"],
        "submitted_at":      state["submitted_at"],
        "overall_sentiment": state["overall_sentiment"],
        "urgency":           state["urgency"],
        "is_complaint":      "true" if state["is_complaint"] else "false",
        "dominant_topic":    state["dominant_topic"],
    }

    # Step 3 — Add to ChromaDB (or Qdrant on deploy)
    # The document ID is the response_id so we can upsert/delete by it later.
    store = get_vector_store()
    store.add_documents(
        documents=[Document(page_content=doc_text, metadata=metadata)],
        ids=[state["response_id"]],
    )

    # Step 4 — Update MongoDB ai_analysis block
    db = await get_db()
    await db.responses.update_one(
        {"response_id": state["response_id"]},
        {
            "$set": {
                "ai_analysis.status":            "done",
                "ai_analysis.overall_sentiment": state["overall_sentiment"],
                "ai_analysis.sentiment_score":   state["sentiment_score"],
                "ai_analysis.urgency":           state["urgency"],
                "ai_analysis.is_complaint":      state["is_complaint"],
                "ai_analysis.dominant_topic":    state["dominant_topic"],
                "ai_analysis.per_text_analysis": state.get("per_text_analysis", {}),
                "ai_analysis.summary":           state.get("summary", ""),
                "ai_analysis.processed_at":      processed_at,
            }
        },
    )

    # Step 5 — Mark success
    state["embedding_stored"] = True
    return state
