"""
InsightLoop AI Service — POST /analyze Route (Stub)
====================================================
Processes a single feedback response through the LangGraph AI pipeline.

Called by the Node backend (async/fire-and-forget) immediately after saving
a feedback response to MongoDB with ai_analysis.status = "pending".

Implementation pending — LangGraph pipeline node design is TBD.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse

router = APIRouter()


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyze Feedback Response",
    description="""
Processes a single customer feedback response through the AI pipeline.

**Pipeline (implementation TBD):**
1. Text analysis (LLM) — sentiment, topics, key phrases, intent per text answer
2. Overall derivation (rule-based) — urgency, is_complaint, dominant_topic
3. Summarization (LLM) — 1-2 sentence human-readable summary
4. Embed & store — ChromaDB embedding + MongoDB `ai_analysis` update

**Called by:** Node backend only, async after saving response to MongoDB.

**On failure:** Returns `500`. Node backend keeps `ai_analysis.status = "pending"`.
The retry worker (scheduled) will pick it up automatically.
    """,
    responses={
        200: {"description": "Analysis completed successfully."},
        422: {"description": "Invalid request body — Pydantic validation error."},
        500: {"description": "Pipeline error — LLM failure, DB write failure, etc."},
        501: {"description": "Not yet implemented."},
    },
)
async def analyze_feedback(body: AnalyzeRequest) -> JSONResponse:
    """
    Run the LangGraph feedback analysis pipeline on one response.

    Args:
        body (AnalyzeRequest): The feedback response data from Node backend.

    Returns:
        AnalyzeResponse: Full structured analysis result.

    TODO: Implement after LangGraph pipeline design is finalized.
    """
    # TODO: Build FeedbackState from body
    # TODO: Run feedback_graph.ainvoke(state)
    # TODO: Call check_and_create_alerts(final_state)
    # TODO: Return AnalyzeResponse from final state

    return JSONResponse(
        status_code=501,
        content={
            "error": "Not Implemented",
            "detail": "Pipeline implementation pending. LangGraph node design TBD.",
        },
    )
