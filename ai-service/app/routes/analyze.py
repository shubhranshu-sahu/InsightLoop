"""
InsightLoop AI Service — POST /analyze Route
============================================
Processes a single customer feedback response through the LangGraph pipeline.

Called by the Node backend (fire-and-forget, async) immediately after the
raw feedback response is saved to MongoDB with ai_analysis.status = "pending".

Pipeline steps (see app/pipeline/ for details):
    1. analyze_text_node   — 1 LLM call  — sentiment/topics/intent per text answer
    2. derive_overall_node — 0 LLM calls — overall sentiment, urgency, dominant topic
    3. summarize_node      — 1 LLM call  — 1-2 sentence human summary
    4. embed_store_node    — 0 LLM calls — ChromaDB embed + MongoDB $set

Post-pipeline:
    check_and_create_alerts() — MySQL alert if urgency threshold crossed
    [CURRENTLY SKIPPED — MySQL not configured; runs silently as no-op]

Auth:
    Requires X-Internal-Secret header (validated by middleware in main.py).

Error handling:
    On any unhandled exception → HTTP 500.
    MongoDB document stays status:"pending" → retry worker picks it up later.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.alerts.checker import check_and_create_alerts
from app.pipeline.graph import feedback_graph
from app.pipeline.state import FeedbackState
from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse, PerTextAnalysis

router = APIRouter()


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyze Feedback Response",
    description="""
Processes a single customer feedback response through the 4-node LangGraph pipeline.

**Pipeline (2 total LLM calls):**
1. `analyze_text_node` — 1 LLM call — NLP analysis of all text answers
2. `derive_overall_node` — 0 LLM calls — rule-based overall sentiment + urgency
3. `summarize_node` — 1 LLM call — 1-2 sentence human-readable summary
4. `embed_store_node` — 0 LLM calls — ChromaDB embedding + MongoDB `ai_analysis` update

**Post-pipeline:**
- Alert threshold check (requires MySQL — currently disabled, wired for future use)

**Called by:** Node backend only, async (fire-and-forget) after saving response to MongoDB.

**On success:** Returns full structured analysis. MongoDB document updated to `status: "done"`.

**On failure:** Returns `500`. MongoDB stays `status: "pending"`. Retry worker picks it up.
    """,
    responses={
        200: {"description": "Analysis completed. Full structured result returned."},
        422: {"description": "Invalid request body — Pydantic validation error."},
        500: {"description": "Pipeline error — LLM failure, DB write failure, etc."},
    },
)
async def analyze_feedback(body: AnalyzeRequest) -> AnalyzeResponse:
    """
    Run the LangGraph feedback analysis pipeline on one response.

    Builds an initial FeedbackState from the request body, invokes the
    compiled LangGraph graph, runs the alert checker (silently skipped if
    MySQL is not configured), and maps the final state to an AnalyzeResponse.

    Args:
        body (AnalyzeRequest): Feedback response data from the Node backend.
            Includes: response_id, form_id, business_id, submitted_at, answers.

    Returns:
        AnalyzeResponse: Full structured analysis result including sentiment,
            urgency, per-text analysis, and summary.

    Raises:
        HTTPException 500: If the pipeline raises any unhandled exception.
    """
    # ── Build initial state from request body ─────────────────────────────────
    # Convert AnswerItem Pydantic models to plain dicts for the TypedDict state.
    initial_state: FeedbackState = {
        "response_id":      body.response_id,
        "form_id":          body.form_id,
        "business_id":      body.business_id,
        "submitted_at":     body.submitted_at,
        "answers": {
            qid: ans.model_dump()
            for qid, ans in body.answers.items()
        },
        # ── Derived fields — nodes populate these during the pipeline run ─────
        "per_text_analysis": {},
        "overall_sentiment": "",
        "sentiment_score":   0.0,
        "urgency":           "",
        "is_complaint":      False,
        "dominant_topic":    "",
        "summary":           "",
        "embedding_stored":  False,
        "error":             None,
    }

    # ── Run the LangGraph pipeline ────────────────────────────────────────────
    try:
        final_state: FeedbackState = await feedback_graph.ainvoke(initial_state)
    except Exception as exc:
        # Log failure. MongoDB stays status:"pending" so retry worker picks it up.
        print(
            f"[/analyze] Pipeline failed for response_id={body.response_id}: {exc}"
        )
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline error: {exc}",
        ) from exc

    # ── Alert threshold check ─────────────────────────────────────────────────
    # Runs silently — NotImplementedError is expected until MySQL is configured.
    # Any other exception is also caught to ensure alerts never break the response.
    try:
        await check_and_create_alerts(final_state)
    except NotImplementedError:
        pass  # MySQL not configured — skip silently
    except Exception as alert_exc:
        # Log but do not fail — alert is non-critical
        print(f"[/analyze] Alert check failed (non-critical): {alert_exc}")

    # ── Map final state → AnalyzeResponse ─────────────────────────────────────
    # Validate per_text_analysis dicts against the PerTextAnalysis Pydantic model
    per_text = {
        qid: PerTextAnalysis(**analysis)
        for qid, analysis in final_state.get("per_text_analysis", {}).items()
    }

    return AnalyzeResponse(
        response_id=final_state["response_id"],
        status="done",
        overall_sentiment=final_state["overall_sentiment"],
        sentiment_score=final_state["sentiment_score"],
        urgency=final_state["urgency"],
        is_complaint=final_state["is_complaint"],
        dominant_topic=final_state["dominant_topic"],
        per_text_analysis=per_text,
        summary=final_state["summary"],
        processed_at=datetime.now(timezone.utc).isoformat(),
    )
