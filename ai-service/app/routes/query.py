"""
InsightLoop AI Service — POST /query Route (Stub)
==================================================
Handles natural language queries from business owners about their feedback data.

Called by the Node backend when a user sends a message in the AI Chat UI.
FastAPI is stateless — Node sends the full chat history on every request.

Implementation planned in phases:
    Phase 1: LLM + form schema context (no retrieval)
    Phase 2: + RAG tool (ChromaDB semantic search)
    Phase 3: + Data tool (MongoDB → pandas aggregations)
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.query import QueryRequest, QueryResponse

router = APIRouter()


@router.post(
    "/query",
    response_model=QueryResponse,
    summary="AI Chat Query",
    description="""
Answers a natural language question from a business owner about their feedback data.

**FastAPI is stateless** — Node backend sends the full chat history on every request.
Node manages the session document in MongoDB (`chat_sessions` collection).

**Response includes `sources`** — the feedback responses retrieved by RAG that
were used to generate the answer. Frontend renders these as citation pills.

**`query_type` field:**
- `qualitative` — answered via RAG (semantic search of feedback text)
- `quantitative` — answered via data aggregation (counts, averages, trends)
    """,
    responses={
        200: {"description": "Query answered successfully."},
        422: {"description": "Invalid request body."},
        501: {"description": "Not yet implemented."},
    },
)
async def query_feedback(body: QueryRequest) -> JSONResponse:
    """
    Answer a business owner's natural language question about their feedback data.

    Args:
        body (QueryRequest): Query, business_id, form_id, session_id, chat_history.

    Returns:
        QueryResponse: AI answer, source citations, query type, tokens used.

    TODO: Implement Phase 1 (basic LLM) → Phase 2 (RAG) → Phase 3 (data tool).
    """
    # TODO: Build form schema context from MySQL questions table
    # TODO: Phase 1: Build system prompt + invoke LLM with chat history
    # TODO: Phase 2: Add RAG tool — ChromaDB similarity search
    # TODO: Phase 3: Add data tool — MongoDB → pandas aggregation
    # TODO: Log query to MongoDB ai_queries collection

    return JSONResponse(
        status_code=501,
        content={
            "error": "Not Implemented",
            "detail": "Chat engine implementation pending.",
        },
    )
