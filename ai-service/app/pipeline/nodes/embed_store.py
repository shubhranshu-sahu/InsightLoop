"""
InsightLoop AI Service — Node 4: embed_store_node
==================================================
LangGraph pipeline node that embeds the processed feedback response and
persists it to ChromaDB and MongoDB.

Responsibility:
    1. Build a rich natural-language prose document from the full state
    2. Embed it using the Gemini embedding model
    3. Store it in ChromaDB with metadata for filtered retrieval
    4. Update the MongoDB `responses` document (ai_analysis.$set)
    5. Set state["embedding_stored"] = True

Input  (reads from state):
    All fields — builds a comprehensive document from the full state.

Output (writes to state):
    state["embedding_stored"]   — True on success, False on skip/failure

LLM call count: 0 (uses embedding model, not generative LLM)

Dev mode:
    ChromaDB and MongoDB calls are skipped in development.
    The node logs a message and sets embedding_stored = False.
    To enable, set DEV_SKIP_STORAGE = False in config or implement the
    actual DB calls once MongoDB / ChromaDB are set up.
"""

from datetime import datetime, timezone

from app.pipeline.state import FeedbackState


# ── Document Builder ──────────────────────────────────────────────────────────


def _build_vector_document(state: FeedbackState) -> str:
    """
    Build a rich natural-language prose document for embedding.

    Why prose (not JSON)?
        The embedding model converts text to a vector. Natural language prose
        retrieves better semantically than raw JSON. When a business owner asks
        "complaints about cold food", the semantic similarity between that query
        and "biryani arrived cold" in this document drives accurate retrieval.

    Args:
        state: Full FeedbackState after all previous nodes have run.

    Returns:
        str: Natural-language document ready for embedding.
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

    # Text analysis block
    for qid, analysis in text_analysis.items():
        label = analysis.get("label", "")
        raw = analysis.get("raw_answer", "")
        topics_str = ", ".join(analysis.get("topics", []))
        phrases_str = ", ".join(analysis.get("key_phrases", []))
        intent = analysis.get("intent", "")
        sentiment = analysis.get("sentiment", "")

        lines.append(f"Q: {label}")
        lines.append(f'A: "{raw}"')
        lines.append(
            f"→ Sentiment: {sentiment} | Topics: {topics_str} | "
            f"Key phrases: {phrases_str} | Intent: {intent}"
        )
        lines.append("")

    # Summary line
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

    Builds a natural-language document from the full response state,
    embeds it using Gemini, and persists it to ChromaDB + MongoDB.

    In dev mode (no DB connections configured), this node is a no-op:
    it logs a skip message and sets embedding_stored = False.

    Flow:
        1. Build prose document from full state
        2. [DEV: skip] Embed document via Gemini text-embedding-004
        3. [DEV: skip] Add to ChromaDB collection with metadata
        4. [DEV: skip] Update MongoDB responses.$set(ai_analysis)
        5. Set state["embedding_stored"] = True / False

    Args:
        state: Full FeedbackState after all previous nodes have run.

    Returns:
        Updated FeedbackState with `embedding_stored` set.

    TODO (Phase 2 — once DB is set up):
        - Uncomment ChromaDB calls (app.vector.store)
        - Uncomment MongoDB $set update (app.db.mongo)
        - Remove DEV_SKIP_STORAGE guard
    """
    # Build the document (always — useful for debugging even in dev mode)
    doc_text = _build_vector_document(state)

    # ── DEV MODE: Skip DB and vector store calls ─────────────────────────────
    # Remove this block once MongoDB and ChromaDB are configured.
    DEV_SKIP_STORAGE = True  # ← Set to False when DBs are ready

    if DEV_SKIP_STORAGE:
        print(
            f"[embed_store_node] DEV MODE — skipping ChromaDB + MongoDB writes "
            f"for response_id={state['response_id']}"
        )
        print(f"[embed_store_node] Document that would be embedded:\n{doc_text[:300]}...")
        state["embedding_stored"] = False
        return state

    # ── PRODUCTION: ChromaDB + MongoDB writes ─────────────────────────────────
    # Uncomment and implement when DBs are ready.

    # from app.vector.embedder import get_embedder
    # from app.vector.store import get_vector_store
    # from app.db.mongo import get_db

    # embedder = get_embedder()
    # store = get_vector_store()

    # metadata = {
    #     "response_id":       state["response_id"],
    #     "form_id":           state["form_id"],
    #     "business_id":       state["business_id"],
    #     "submitted_at":      state["submitted_at"],
    #     "overall_sentiment": state["overall_sentiment"],
    #     "urgency":           state["urgency"],
    #     "is_complaint":      str(state["is_complaint"]),  # ChromaDB needs str for bool
    #     "dominant_topic":    state["dominant_topic"],
    # }

    # store.add_texts(
    #     texts=[doc_text],
    #     metadatas=[metadata],
    #     ids=[state["response_id"]],
    # )

    # db = await get_db()
    # await db.responses.update_one(
    #     {"response_id": state["response_id"]},
    #     {"$set": {
    #         "ai_analysis.status":            "done",
    #         "ai_analysis.overall_sentiment": state["overall_sentiment"],
    #         "ai_analysis.sentiment_score":   state["sentiment_score"],
    #         "ai_analysis.urgency":           state["urgency"],
    #         "ai_analysis.is_complaint":      state["is_complaint"],
    #         "ai_analysis.dominant_topic":    state["dominant_topic"],
    #         "ai_analysis.per_text_analysis": state.get("per_text_analysis", {}),
    #         "ai_analysis.summary":           state.get("summary", ""),
    #         "ai_analysis.processed_at":      datetime.now(timezone.utc),
    #     }}
    # )

    state["embedding_stored"] = True
    return state
