"""
InsightLoop AI Service — Node 1: analyze_text_node
===================================================
LangGraph pipeline node that runs NLP analysis on all text-type answers
from a feedback response using a single Gemini LLM call.

Responsibility:
    Process ALL text answers at once (one LLM call, not one per question).
    Ratings and yes/no answers are completely ignored here — they don't need LLM.

Input  (reads from state):
    state["answers"]  — full answers map, filters to type == "text" only

Output (writes to state):
    state["per_text_analysis"]  — dict keyed by question_id, one entry per text answer

LLM call count: 1 (or 0 if no text answers exist)

Skips LLM entirely if:
    - The form has no text questions
    - All text answers are empty strings
"""

import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings
from app.pipeline.state import FeedbackState

# ── LLM Instance ──────────────────────────────────────────────────────────────
# Singleton — created once when this module is imported.
# temperature=0: deterministic output — we want consistent structured JSON, not creativity.
llm = ChatGoogleGenerativeAI(
    model=settings.GEMINI_LLM_MODEL,
    google_api_key=settings.GEMINI_API_KEY,
    temperature=0,
)

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a feedback analysis engine for a customer feedback platform.
Analyze customer feedback text answers and return structured JSON.

Rules:
- Base your analysis ONLY on what the customer actually wrote. Do not infer or assume.
- Return ONLY valid JSON. No markdown code blocks, no explanation, no extra text.
- Be precise and consistent with the sentiment/intent classifications.
"""


def _build_analysis_prompt(text_answers: list[dict]) -> str:
    """
    Build the user prompt for the text analysis LLM call.

    Bundles all text answers into a single prompt so we make exactly one LLM call
    regardless of how many text questions the form has.

    Args:
        text_answers: List of dicts, each with keys:
                      question_id, label, value

    Returns:
        str: Formatted prompt string ready for the LLM.

    Example input:
        [
            {"question_id": "uuid-q4", "label": "What could we do better?",
             "value": "biryani was cold"},
            {"question_id": "uuid-q5", "label": "What did you enjoy most?",
             "value": "ambience was nice"},
        ]
    """
    lines = ["Analyze the following customer feedback answers:\n"]

    for ans in text_answers:
        lines.append(f'Question ID: "{ans["question_id"]}"')
        lines.append(f'Question:    "{ans["label"]}"')
        lines.append(f'Answer:      "{ans["value"]}"\n')

    lines.append(
        """Return a JSON object with this EXACT structure (one entry per question_id):
{
  "<question_id>": {
    "sentiment":       "positive" | "neutral" | "negative",
    "sentiment_score": <float 0.0 to 1.0>,
    "topics":          [<list of 1-3 topic strings>],
    "key_phrases":     [<list of exact short phrases lifted from the answer text>],
    "intent":          "complaint" | "compliment" | "suggestion" | "neutral",
    "emotions":        [<list of emotion strings, can be empty []>]
  }
}

Only include question_ids that were provided. Return nothing else."""
    )

    return "\n".join(lines)


def _extract_json_from_response(raw: str) -> dict:
    """
    Extract and parse the JSON object from the LLM response string.

    The LLM is instructed to return only JSON, but occasionally wraps it
    in markdown code fences. This function handles that gracefully.

    Args:
        raw: Raw LLM response string.

    Returns:
        dict: Parsed JSON object.

    Raises:
        ValueError: If no valid JSON object can be found in the response.
    """
    # Strip markdown fences if present (```json ... ``` or ``` ... ```)
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"LLM returned non-JSON output. Raw response:\n{raw[:500]}"
        ) from exc


# ── Node Function ─────────────────────────────────────────────────────────────


async def analyze_text_node(state: FeedbackState) -> FeedbackState:
    """
    LangGraph Node 1 — Text Analysis.

    Extracts only the text-type answers from the response, bundles them into
    one LLM prompt, and parses the structured JSON result into `per_text_analysis`.

    Flow:
        1. Filter answers → keep only type == "text" and value.strip() != ""
        2. If none → set per_text_analysis = {} and return (skip LLM)
        3. Build analysis prompt with all text answers
        4. Call Gemini LLM (1 call total regardless of question count)
        5. Parse JSON response
        6. Augment each entry with `label` and `raw_answer` from the answers map
        7. Set state["per_text_analysis"]

    Args:
        state: Current FeedbackState. Reads `answers`.

    Returns:
        Updated FeedbackState with `per_text_analysis` populated.
    """
    answers = state["answers"]

    # Step 1 — Filter to text-type answers only
    text_answers = [
        {
            "question_id": qid,
            "label": ans["label"],
            "value": ans["value"],
        }
        for qid, ans in answers.items()
        if ans.get("type") == "text" and str(ans.get("value", "")).strip()
    ]

    # Step 2 — No text answers → skip LLM, return empty analysis
    if not text_answers:
        state["per_text_analysis"] = {}
        return state

    # Step 3 — Build prompt
    prompt = _build_analysis_prompt(text_answers)

    # Step 4 — LLM call
    response = await llm.ainvoke(
        [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]
    )

    # Step 5 — Parse JSON
    raw_analysis = _extract_json_from_response(response.content)

    # Step 6 — Augment each entry with label + raw_answer from the answers map
    # This makes each PerTextAnalysis self-contained in MongoDB
    per_text: dict[str, dict] = {}
    for qid, analysis in raw_analysis.items():
        original_answer = answers.get(qid, {})
        per_text[qid] = {
            "label": original_answer.get("label", ""),
            "raw_answer": str(original_answer.get("value", "")),
            **analysis,
        }

    # Step 7 — Write to state
    state["per_text_analysis"] = per_text
    return state
