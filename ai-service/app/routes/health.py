"""
InsightLoop AI Service — Health Check Route
============================================
GET /health

Public endpoint — no X-Internal-Secret header required.
Used by the Node backend, load balancers, and monitoring tools
to verify the AI service is alive and correctly configured.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class HealthResponse(BaseModel):
    """Response model for the GET /health endpoint."""

    status: str
    service: str
    llm_model: str
    embedding_model: str
    vector_store: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "ok",
                "service": "insightloop-ai",
                "llm_model": "gemini-2.0-flash",
                "embedding_model": "models/text-embedding-004",
                "vector_store": "chroma",
            }
        }
    }


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health Check",
    description=(
        "Returns operational status of the AI service and its configured components. "
        "**This endpoint is public** — no `X-Internal-Secret` header required. "
        "Use this for liveness probes and monitoring."
    ),
    responses={
        200: {"description": "Service is running normally."},
    },
)
async def health_check() -> HealthResponse:
    """
    Liveness check for the InsightLoop AI service.

    Returns the current status of the service along with which
    LLM model, embedding model, and vector store are configured.

    This is a lightweight check — it does not ping external services
    like MongoDB or MySQL. It only confirms the process is running
    and configuration is loaded.

    Returns:
        HealthResponse: Service status and component configuration.
    """
    return HealthResponse(
        status="ok",
        service="insightloop-ai",
        llm_model=settings.GEMINI_LLM_MODEL,
        embedding_model=settings.GEMINI_EMBEDDING_MODEL,
        vector_store=settings.VECTOR_STORE_BACKEND
    )
