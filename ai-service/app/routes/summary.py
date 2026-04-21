"""
InsightLoop AI Service — POST /summary Route (Stub)
====================================================
Generates a structured form-level summary for a given date range.

Called by the Node backend when a business owner generates a report.
The Node backend formats the returned structured data into a PDF.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.summary import SummaryRequest, SummaryResponse

router = APIRouter()


@router.post(
    "/summary",
    response_model=SummaryResponse,
    summary="Generate Form Summary",
    description="""
Generates a structured summary of all feedback responses for a specific form
within a given date range.

**Called by:** Node backend when a business owner clicks "Generate Report".

**Output is used to:** Build a PDF report showing sentiment breakdown,
average ratings, top complaints, recommendations, and urgent issues.

**Source data:** MongoDB `responses` collection — only includes responses
with `ai_analysis.status = "done"` (fully processed).
    """,
    responses={
        200: {"description": "Summary generated successfully."},
        422: {"description": "Invalid request body."},
        501: {"description": "Not yet implemented."},
    },
)
async def generate_summary(body: SummaryRequest) -> JSONResponse:
    """
    Generate a structured report summary for a form within a date range.

    Args:
        body (SummaryRequest): business_id, form_id, date_from, date_to.

    Returns:
        SummaryResponse: Full structured summary ready for PDF formatting.

    TODO: Implement after /analyze pipeline is complete and data is available.
    """
    # TODO: Query MongoDB for all responses in date range with status "done"
    # TODO: Aggregate sentiment counts, average ratings, top topics
    # TODO: Use LLM to generate top_positives, top_complaints, recommendations
    # TODO: Return structured SummaryResponse

    return JSONResponse(
        status_code=501,
        content={
            "error": "Not Implemented",
            "detail": "Summary generation pending. Requires /analyze to be working first.",
        },
    )
