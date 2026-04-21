"""
InsightLoop AI Service — Gemini Embedding Model Wrapper (Stub)
==============================================================
Wraps the Google Gemini text embedding model used to convert feedback
documents into vector representations for ChromaDB storage.

Model: models/text-embedding-004 (configured via GEMINI_EMBEDDING_MODEL env var)
Provider: Google Generative AI via langchain-google-genai

Singleton pattern — model is initialized once on first call.
"""

# TODO: Implement embedding model wrapper
# from langchain_google_genai import GoogleGenerativeAIEmbeddings
# from app.config import settings

_embedder = None


def get_embedder():
    """
    Returns the singleton Gemini embedding model instance.

    Initializes the model on first call using settings.GEMINI_API_KEY
    and settings.GEMINI_EMBEDDING_MODEL. Subsequent calls return the
    cached instance.

    Returns:
        GoogleGenerativeAIEmbeddings: Ready-to-use embedding model.

    TODO: Implement.
    """
    # global _embedder
    # if _embedder is None:
    #     _embedder = GoogleGenerativeAIEmbeddings(
    #         model=settings.GEMINI_EMBEDDING_MODEL,
    #         google_api_key=settings.GEMINI_API_KEY,
    #     )
    # return _embedder
    raise NotImplementedError("Embedder not yet implemented.")
