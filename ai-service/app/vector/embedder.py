"""
InsightLoop AI Service — Gemini Embedding Model Wrapper
========================================================
Provides a singleton instance of the Gemini text embedding model used to
convert feedback prose documents into vector representations for ChromaDB.

Model: models/text-embedding-004  (configured via GEMINI_EMBEDDING_MODEL)
Provider: Google Generative AI via langchain-google-genai

Singleton pattern:
    The model is initialized once on the first call to get_embedder().
    All subsequent calls return the cached instance. This avoids re-creating
    the API client on every embed call.

Usage:
    from app.vector.embedder import get_embedder
    embedder = get_embedder()
    vector = embedder.embed_query("the food was cold")         # single string
    vectors = embedder.embed_documents(["text1", "text2"])     # batch
"""

from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.config import settings

# Module-level singleton — initialized on first get_embedder() call
_embedder: GoogleGenerativeAIEmbeddings | None = None


def get_embedder() -> GoogleGenerativeAIEmbeddings:
    """
    Return the singleton Gemini embedding model instance.

    Initializes the model on first call using GEMINI_API_KEY and
    GEMINI_EMBEDDING_MODEL from settings. Subsequent calls return the
    cached instance without re-authenticating.

    Returns:
        GoogleGenerativeAIEmbeddings: LangChain-compatible embedding model.
            Implements the Embeddings interface used by all LangChain
            vector store wrappers (Chroma, Qdrant, etc.).

    Raises:
        google.api_core.exceptions.PermissionDenied: If GEMINI_API_KEY is invalid.

    Note:
        This function is synchronous. The underlying embed_query / embed_documents
        calls ARE synchronous too — Gemini's embedding API doesn't have an async
        variant in langchain-google-genai yet. This is fine since embed_store_node
        awaits only the async MongoDB call; the embedding call is a regular call
        inside the async function.
    """
    global _embedder
    if _embedder is None:
        _embedder = GoogleGenerativeAIEmbeddings(
            model=settings.GEMINI_EMBEDDING_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
        )
    return _embedder
