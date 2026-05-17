"""
InsightLoop AI Service — Vector Store Factory
==============================================
Manages the vector store used to persist and retrieve feedback response embeddings.

Current backend: ChromaDB (local persistent files, via langchain-chroma)
Future backend:  Qdrant (cloud, via langchain-qdrant) — switch by changing .env only

Architecture — LangChain VectorStore abstraction:
    Both Chroma and QdrantVectorStore are subclasses of langchain_core's VectorStore.
    They expose identical methods: add_documents(), similarity_search(),
    similarity_search_with_relevance_scores(), delete().

    All callers (embed_store_node, rag_tool.py) use get_vector_store() and call
    standard LangChain methods — they NEVER need to change when switching backends.

Qdrant migration (when deploying):
    1. pip install langchain-qdrant qdrant-client
    2. Set VECTOR_STORE_BACKEND=qdrant in .env
    3. Set QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION_NAME in .env
    4. Done. No code changes needed anywhere else.

ChromaDB metadata note:
    ChromaDB only supports str/int/float in metadata filters.
    Boolean values (is_complaint) are stored as "true"/"false" strings.
    The search_with_sources() helper handles this transparently.

Usage:
    from app.vector.store import get_vector_store, search_with_sources
    store = get_vector_store()
    store.add_documents([Document(page_content="...", metadata={...})])
    results = search_with_sources("cold food complaints", business_id, form_id)
"""

from dataclasses import dataclass

from langchain_core.documents import Document
from langchain_core.vectorstores import VectorStore

from app.config import settings
from app.vector.embedder import get_embedder

# Module-level singleton — initialized once, reused across requests
_store: VectorStore | None = None


# ── Search Result Model ───────────────────────────────────────────────────────


@dataclass
class SearchResult:
    """
    A single result from a vector similarity search.

    Used by the RAG tool (Phase 3) to build source citations.
    The `response_id` in metadata links back to the original MongoDB document
    so the frontend can display "Source: feedback from April 12" with a link.

    Fields:
        response_id:  UUID of the original feedback response (from metadata).
        page_content: The prose document text — first N chars used as snippet.
        metadata:     Full metadata dict as stored in ChromaDB/Qdrant.
        score:        Relevance score (0.0 to 1.0). Higher = more relevant.
    """
    response_id:  str
    page_content: str
    metadata:     dict
    score:        float


# ── Vector Store Factory ──────────────────────────────────────────────────────


def get_vector_store() -> VectorStore:
    """
    Return the singleton LangChain VectorStore instance.

    Reads VECTOR_STORE_BACKEND from settings to decide which backend to use.
    Initializes the store on the first call and caches it for subsequent calls.

    Returns:
        VectorStore: A LangChain VectorStore implementation (Chroma or Qdrant).
            Supports: add_documents(), similarity_search(),
            similarity_search_with_relevance_scores(), delete().

    Raises:
        ValueError: If VECTOR_STORE_BACKEND is not "chroma" or "qdrant".
        RuntimeError: If Qdrant is selected but QDRANT_URL / QDRANT_API_KEY are empty.
    """
    global _store
    if _store is not None:
        return _store

    backend = settings.VECTOR_STORE_BACKEND.lower()

    if backend == "qdrant":
        # ── Qdrant (production) ───────────────────────────────────────────────
        # Install: pip install langchain-qdrant qdrant-client
        if not settings.QDRANT_URL or not settings.QDRANT_API_KEY:
            raise RuntimeError(
                "QDRANT_URL and QDRANT_API_KEY must be set when "
                "VECTOR_STORE_BACKEND=qdrant."
            )
        from langchain_qdrant import QdrantVectorStore  # noqa: PLC0415
        from qdrant_client import QdrantClient           # noqa: PLC0415

        client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
        )
        
        # ── BUG FIX: Qdrant Payload Index Creation ────────────────────────────
        # Qdrant requires a payload index of type 'keyword' for any field used
        # in exact-match filtering (like business_id and form_id). We ensure the
        # collection exists and create the indexes here.
        from qdrant_client.http.models import VectorParams, Distance, PayloadSchemaType
        try:
            if not client.collection_exists(settings.QDRANT_COLLECTION_NAME):
                # Gemini embedding vectors are 768 dimensions
                client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION_NAME,
                    vectors_config=VectorParams(size=768, distance=Distance.COSINE)
                )
            
            # CRITICAL: LangChain's QdrantVectorStore nests all metadata
            # under a 'metadata' sub-key in the Qdrant payload.
            # Payload structure: {"page_content": "...", "metadata": {"business_id": ..., "form_id": ...}}
            # So the indexed field path must be "metadata.business_id", NOT "business_id".
            client.create_payload_index(
                collection_name=settings.QDRANT_COLLECTION_NAME,
                field_name="metadata.business_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            client.create_payload_index(
                collection_name=settings.QDRANT_COLLECTION_NAME,
                field_name="metadata.form_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
        except Exception as e:
            print(f"[Qdrant] Warning: Failed to ensure payload indexes: {e}")

        _store = QdrantVectorStore(
            client=client,
            collection_name=settings.QDRANT_COLLECTION_NAME,
            embedding=get_embedder(),
        )

    elif backend == "chroma":
        # ── ChromaDB (local development) ──────────────────────────────────────
        # Install: pip install langchain-chroma chromadb
        from langchain_chroma import Chroma  # noqa: PLC0415

        _store = Chroma(
            collection_name=settings.CHROMA_COLLECTION_NAME,
            embedding_function=get_embedder(),
            persist_directory=settings.VECTOR_STORE_PATH,
        )

    else:
        raise ValueError(
            f"Unknown VECTOR_STORE_BACKEND='{backend}'. "
            "Expected 'chroma' or 'qdrant'."
        )

    return _store


# ── Filtered Search Helper ────────────────────────────────────────────────────


def search_with_sources(
    query: str,
    business_id: str,
    form_id: str,
    k: int = 8,
    min_score: float = 0.3,
) -> list[SearchResult]:
    """
    Perform a filtered semantic similarity search scoped to one business + form.

    Uses ChromaDB's native `filter` parameter (or Qdrant's equivalent) to
    restrict results to the correct tenant and form before ranking by similarity.
    This is exact filtering — not FAISS-style post-filtering.

    Args:
        query:       The natural-language search query from the chat user.
        business_id: Restrict results to this business only (tenant isolation).
        form_id:     Restrict results to this form only.
        k:           Maximum number of results to return (default: 8).
        min_score:   Minimum relevance score threshold (default: 0.5).
                     Results below this score are filtered out.

    Returns:
        list[SearchResult]: Ranked results with response_id, page_content,
            metadata, and relevance score. Used by the RAG tool to build
            source citations in the QueryResponse.

    Note on ChromaDB filter syntax:
        ChromaDB requires all filter values to be str/int/float.
        Boolean fields like is_complaint are stored as "true"/"false" strings.
        To filter by complaint status: filter={"is_complaint": "true"}

    Example (Phase 3 — RAG tool):
        results = search_with_sources(
            query="complaints about cold food",
            business_id="biz-xyz",
            form_id="form-abc",
        )
        sources = [
            {"response_id": r.response_id,
             "submitted_at": r.metadata.get("submitted_at"),
             "snippet": r.page_content[:200]}
            for r in results
        ]
    """
    store = get_vector_store()
    
    # ── BUG FIX: Qdrant Filter Validation ─────────────────────────────────────
    # Qdrant client >= 1.10 rejects raw dictionaries for filtering.
    search_filter = None
    if settings.VECTOR_STORE_BACKEND.lower() == "qdrant":
        from qdrant_client.http import models as rest
        # CRITICAL: LangChain's QdrantVectorStore nests metadata under a 'metadata' sub-key.
        # The payload structure is: {"page_content": "...", "metadata": {"business_id": ..., "form_id": ...}}
        # We must filter on "metadata.business_id" NOT "business_id" at the top level.
        search_filter = rest.Filter(
            must=[
                rest.FieldCondition(key="metadata.business_id", match=rest.MatchValue(value=business_id)),
                rest.FieldCondition(key="metadata.form_id", match=rest.MatchValue(value=form_id)),
            ]
        )
    else:
        # ChromaDB still uses dictionary filters
        search_filter = {
            "business_id": business_id,
            "form_id": form_id,
        }

    raw_results = store.similarity_search_with_relevance_scores(
        query=query,
        k=k,
        filter=search_filter,
    )

    return [
        SearchResult(
            response_id=doc.metadata.get("response_id", ""),
            page_content=doc.page_content,
            metadata=doc.metadata,
            score=round(score, 4),
        )
        for doc, score in raw_results
        if score >= min_score
    ]
