"""
InsightLoop AI Service — Node: Embed & Store (Stub)
====================================================
LangGraph node that:
    1. Builds a rich natural-language document from the feedback response
    2. Embeds it using Gemini text-embedding-004
    3. Stores it in ChromaDB with metadata for filtered retrieval
    4. Updates the MongoDB responses document (ai_analysis.$set)

No LLM call — uses the embedding model only.

TODO: Implement after pipeline node design is finalized.
"""

from app.pipeline.state import FeedbackState


async def embed_store_node(state: FeedbackState) -> FeedbackState:
    """
    Node 4 (or TBD): Embedding and storage.

    Writes to:
        - ChromaDB: embedded vector document with full metadata
        - MongoDB: $set on ai_analysis (status="done", all derived fields)

    The ChromaDB document is written as natural-language prose
    (not JSON) because semantic similarity works better on natural text.

    Args:
        state (FeedbackState): Fully populated pipeline state.

    Returns:
        FeedbackState: Unchanged (side effects only — writes to DBs).

    TODO: Implement once node design is decided.
    """
    raise NotImplementedError("embed_store_node not yet implemented.")
