"""
InsightLoop AI Service — Application Configuration
===================================================
Loads all environment variables from the .env file using pydantic-settings.
All configuration is accessed through the singleton `settings` instance.

Usage:
    from app.config import settings

    print(settings.GEMINI_API_KEY)
    print(settings.MONGO_URI)
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables or a .env file.

    All fields are validated at startup. If a required field is missing or
    has an invalid type, Pydantic raises a ValidationError before the app starts.

    Fields with `...` (Ellipsis) as default are required — the app will not
    start without them. Fields with a default value are optional.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",  # silently ignore any unknown env vars
    )

    # ── Server ────────────────────────────────────────────────────────────────
    PORT: int = Field(
        default=8000,
        description="Port the FastAPI server listens on.",
    )

    # ── Security ──────────────────────────────────────────────────────────────
    INTERNAL_SECRET: str = Field(
        ...,
        description=(
            "Shared secret between the Node backend and this AI service. "
            "Node sends this as the 'X-Internal-Secret' request header. "
            "All routes except /health return 403 if this is missing or incorrect."
        ),
    )

    # ── Google Gemini API ─────────────────────────────────────────────────────
    GEMINI_API_KEY: str = Field(
        ...,
        description="Google Generative AI API key. Get from https://aistudio.google.com/",
    )
    GEMINI_LLM_MODEL: str = Field(
        default="gemini-2.0-flash",
        description=(
            "Gemini model used for LLM calls (text analysis, summarization). "
            "Options: gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash"
        ),
    )
    GEMINI_EMBEDDING_MODEL: str = Field(
        default="models/text-embedding-004",
        description=(
            "Gemini embedding model for creating vector representations of feedback. "
            "Options: models/text-embedding-004, models/embedding-001"
        ),
    )

    # ── LangSmith (Tracing & Monitoring) ─────────────────────────────────────
    LANGCHAIN_TRACING_V2: bool = Field(
        default=False,
        description=(
            "Enable LangSmith tracing. When true, all LLM calls and LangGraph "
            "runs are traced in LangSmith. Recommended in development."
        ),
    )
    LANGCHAIN_API_KEY: str = Field(
        default="",
        description="LangSmith API key. Required only when LANGCHAIN_TRACING_V2=true.",
    )
    LANGCHAIN_PROJECT: str = Field(
        default="insightloop-dev",
        description="LangSmith project name for grouping traces.",
    )

    # ── MongoDB ───────────────────────────────────────────────────────────────
    MONGO_URI: str = Field(
        default="mongodb://localhost:27017",
        description=(
            "MongoDB connection URI. Must point to the same instance "
            "used by the Node backend."
        ),
    )
    MONGO_DB_NAME: str = Field(
        default="insightloop",
        description="MongoDB database name.",
    )

    # ── MySQL ─────────────────────────────────────────────────────────────────
    MYSQL_HOST: str = Field(
        default="localhost",
        description="MySQL host.",
    )
    MYSQL_PORT: int = Field(
        default=3306,
        description="MySQL port.",
    )
    MYSQL_USER: str = Field(
        default="root",
        description="MySQL username.",
    )
    MYSQL_PASSWORD: str = Field(
        ...,
        description="MySQL password.",
    )
    MYSQL_DB: str = Field(
        default="insightloop",
        description="MySQL database name.",
    )

    # ── Vector Store (ChromaDB) ───────────────────────────────────────────────
    VECTOR_STORE_PATH: str = Field(
        default="./data/vectorstore",
        description=(
            "Local filesystem path where ChromaDB persists its index files. "
            "This directory is gitignored. On deployment, switch to Qdrant "
            "by updating app/vector/store.py."
        ),
    )
    CHROMA_COLLECTION_NAME: str = Field(
        default="feedback_responses",
        description="ChromaDB collection name for storing feedback response embeddings.",
    )

    # ── Alert Thresholds ──────────────────────────────────────────────────────
    ALERT_HIGH_URGENCY_THRESHOLD: int = Field(
        default=3,
        description=(
            "Minimum number of high-urgency responses within the alert window "
            "required to trigger an alert in MySQL."
        ),
    )
    ALERT_WINDOW_HOURS: int = Field(
        default=6,
        description="Time window (hours) used to count high-urgency responses for alerting.",
    )


# ── Singleton ─────────────────────────────────────────────────────────────────
# Import this instance everywhere — do not instantiate Settings() again.
settings = Settings()
