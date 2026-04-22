"""
InsightLoop AI Service — Node 3: summarize_node
================================================
LangGraph pipeline node that generates a single 1–2 sentence human-readable
summary of the complete feedback response using one Gemini LLM call.

Responsibility:
    Produce a concise, factual summary combining all signals:
    - Rating values (with labels)
    - Text answers and their intent classifications
    - Yes/No answer if present
    - The derived overall sentiment and urgency

Input  (reads from state):
    state["answers"]            — all answers (ratings, text, yesno)
    state["per_text_analysis"]  — text analysis from Node 1
    state["overall_sentiment"]  — from Node 2
    state["urgency"]            — from Node 2

Output (writes to state):
    state["summary"]  — 1–2 sentence human-readable string

LLM call count: 1
"""

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings
from app.pipeline.state import FeedbackState

# ── LLM Instance ──────────────────────────────────────────────────────────────
# Same model as Node 1. Could be a different (cheaper/faster) model in future.
llm = ChatGoogleGenerativeAI(
    model=settings.GEMINI_LLM_MODEL,
    google_api_key=settings.GEMINI_API_KEY,
    temperature=0.2,  # slight creativity for summary — still factual
)


# ── Prompt Builder ────────────────────────────────────────────────────────────


def _build_summary_prompt(state: FeedbackState) -> str:
    """
    Build the summarization prompt from all available state data.

    Compiles a compact snapshot of the entire response for the LLM to summarize.
    Includes: ratings, text answers (with intent), yes/no, and overall derived fields.

    Args:
        state: Full FeedbackState after Nodes 1 and 2 have run.

    Returns:
        str: Prompt string for the summarization LLM call.
    """
    parts: list[str] = []

    answers = state["answers"]
    text_analysis = state.get("per_text_analysis", {})

    # Ratings block
    rating_entries = [
        f'{ans["label"]}: {ans["value"]}/5'
        for ans in answers.values()
        if ans.get("type") == "rating"
    ]
    if rating_entries:
        parts.append("Ratings: " + ", ".join(rating_entries))

    # Text answers block (with intent)
    for qid, analysis in text_analysis.items():
        label = analysis.get("label", answers.get(qid, {}).get("label", ""))
        raw = analysis.get("raw_answer", "")
        intent = analysis.get("intent", "neutral")
        parts.append(f'"{label}": "{raw}" (classified as: {intent})')

    # Yes/No block
    yesno_entries = [
        f'{ans["label"]}: {"Yes" if ans["value"] else "No"}'
        for ans in answers.values()
        if ans.get("type") == "yesno"
    ]
    for entry in yesno_entries:
        parts.append(entry)

    # Overall derived fields
    parts.append(
        f"Overall: {state.get('overall_sentiment', 'unknown')} | "
        f"Urgency: {state.get('urgency', 'unknown')}"
    )

    feedback_snapshot = "\n".join(parts)

    return f"""Summarize this customer feedback response in 1-2 sentences.

Rules:
- Be factual and specific. Only mention what the customer actually said.
- Do not start with "The customer" or "This customer".
- Mention both positives and negatives if both are present.
- Be concise — max 2 sentences.

Feedback data:
{feedback_snapshot}

Summary:"""


# ── Node Function ─────────────────────────────────────────────────────────────


async def summarize_node(state: FeedbackState) -> FeedbackState:
    """
    LangGraph Node 3 — Summarization.

    Generates a 1–2 sentence human-readable summary of the entire feedback response.
    This is the second and final LLM call in the pipeline.

    Flow:
        1. Build a compact snapshot of the response (ratings + text + yesno + derived)
        2. Call Gemini LLM with the summarization prompt
        3. Strip and clean the response text
        4. Set state["summary"]

    Args:
        state: Current FeedbackState. Reads answers, per_text_analysis,
               overall_sentiment, urgency.

    Returns:
        Updated FeedbackState with `summary` populated.
    """
    prompt = _build_summary_prompt(state)

    response = await llm.ainvoke([HumanMessage(content=prompt)])

    # Clean the summary — strip whitespace, remove quotes if LLM wrapped it
    summary = response.content.strip().strip('"').strip("'")

    state["summary"] = summary
    return state
