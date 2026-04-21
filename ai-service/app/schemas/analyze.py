"""
InsightLoop AI Service — Schemas for POST /analyze
===================================================
Pydantic models that define the exact request and response structure
for the feedback analysis endpoint.

These models serve three purposes:
    1. Request validation — FastAPI auto-validates incoming JSON from Node backend
    2. Response serialization — Shapes the JSON returned to Node backend
    3. API documentation — Appears in /docs Swagger UI with examples

Design notes:
    - AnswerItem.value uses Union[bool, int, str] — bool MUST come first.
      Python's bool is a subclass of int, so Pydantic would read False as 0
      if int were first in the Union.
    - PerTextAnalysis includes `label` and `raw_answer` to make each entry
      fully self-contained in MongoDB — no need to cross-reference the answers map.

Contract with Node backend:
    - Node sends AnalyzeRequest after saving raw response to MongoDB
    - FastAPI returns AnalyzeResponse; Node uses it to update its dashboard
    - FastAPI also writes the same data directly to MongoDB via $set
"""

from typing import Literal, Union

from pydantic import BaseModel, Field


# ── Request Models ────────────────────────────────────────────────────────────


class AnswerItem(BaseModel):
    """
    Represents a single answer to one question on the feedback form.

    Keys in the parent `answers` dict are `question_id` UUIDs from the MySQL
    `questions` table — the same UUID used as keys in MongoDB's `answers` map.

    Type rules:
        - "rating" → value is int (1–5 star scale)
        - "text"   → value is str (open-ended customer text)
        - "yesno"  → value is bool (True / False)

    Note on Union ordering:
        bool must come before int in Union[bool, int, str].
        Python's bool is a subclass of int, so if int is checked first,
        Pydantic would coerce False → 0 and True → 1, losing the boolean type.
    """

    label: str = Field(
        ...,
        description=(
            "The question text as written by the business owner, copied from MySQL "
            "`question_text` at form submit time. Makes the document self-describing — "
            "FastAPI does not need a separate MySQL lookup to interpret this answer."
        ),
    )
    type: Literal["rating", "text", "yesno"] = Field(
        ...,
        description="Question type. Determines how the `value` field is interpreted.",
    )
    value: Union[bool, int, str] = Field(
        ...,
        description=(
            "Answer value. "
            "bool for 'yesno' (True/False), "
            "int (1–5) for 'rating', "
            "str for 'text'."
        ),
    )


class AnalyzeRequest(BaseModel):
    """
    Request body for POST /analyze.

    Sent by the Node backend immediately after saving a feedback response
    to MongoDB. The `response_id` must already exist in MongoDB's `responses`
    collection with `ai_analysis.status = "pending"` — FastAPI will update
    that document via `$set` after processing.

    The `answers` map uses question_id (UUID from MySQL) as keys, matching the
    MongoDB document structure exactly. Each AnswerItem carries its own label so
    FastAPI never needs to query MySQL to understand the data.
    """

    response_id: str = Field(
        ...,
        description=(
            "UUID of the feedback response. Must already exist in MongoDB "
            "`responses` collection with `ai_analysis.status = 'pending'`."
        ),
    )
    form_id: str = Field(
        ...,
        description="UUID of the feedback form this response belongs to.",
    )
    business_id: str = Field(
        ...,
        description="UUID of the business (tenant ID). Used for data isolation in queries.",
    )
    submitted_at: str = Field(
        ...,
        description="ISO 8601 timestamp of when the customer submitted this response.",
        examples=["2026-04-15T14:30:00Z"],
    )
    answers: dict[str, AnswerItem] = Field(
        ...,
        description=(
            "Map of question_id → AnswerItem. Keys are UUIDs from MySQL `questions.question_id`. "
            "Each item carries label, type, and value — fully self-describing."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "response_id": "550e8400-e29b-41d4-a716-446655440000",
                "form_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                "business_id": "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
                "submitted_at": "2026-04-15T14:30:00Z",
                "answers": {
                    "uuid-q1": {
                        "label": "How was your overall experience?",
                        "type": "rating",
                        "value": 4,
                    },
                    "uuid-q2": {
                        "label": "Rate the food quality",
                        "type": "rating",
                        "value": 2,
                    },
                    "uuid-q3": {
                        "label": "Rate the service speed",
                        "type": "rating",
                        "value": 1,
                    },
                    "uuid-q4": {
                        "label": "What could we do better?",
                        "type": "text",
                        "value": "The biryani arrived cold and we waited almost 40 minutes.",
                    },
                    "uuid-q5": {
                        "label": "What did you enjoy most?",
                        "type": "text",
                        "value": "The ambience was really nice and the staff were friendly.",
                    },
                    "uuid-q6": {
                        "label": "Would you recommend us?",
                        "type": "yesno",
                        "value": False,
                    },
                },
            }
        }
    }


# ── Response Models ───────────────────────────────────────────────────────────


class PerTextAnalysis(BaseModel):
    """
    AI analysis result for a single text-type answer.

    One instance per text question in the form. Stored as a value in the
    `per_text_analysis` dict (keyed by question_id) in both the API response
    and MongoDB's `ai_analysis.per_text_analysis` field.

    Design note:
        `label` and `raw_answer` are stored here (not just in the parent answers map)
        so that each PerTextAnalysis entry is fully self-contained in MongoDB.
        When the RAG system or LLM reads this later, it doesn't need to
        cross-reference the `answers` map to understand what the analysis is about.
    """

    label: str = Field(
        ...,
        description=(
            "The question text this analysis belongs to "
            "(e.g., 'What could we do better?'). Copied from the answer's label."
        ),
    )
    raw_answer: str = Field(
        ...,
        description=(
            "The exact text the customer wrote "
            "(e.g., 'biryani arrived cold'). Stored for source citation in RAG."
        ),
    )
    sentiment: Literal["positive", "neutral", "negative"] = Field(
        ...,
        description="Sentiment classification of this specific text answer.",
    )
    sentiment_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score for the sentiment (0.0 = least confident, 1.0 = most confident).",
    )
    topics: list[str] = Field(
        default_factory=list,
        description=(
            "Topics / aspects mentioned in this answer "
            "(e.g., 'food temperature', 'wait time', 'staff behavior'). Typically 1–3 items."
        ),
    )
    key_phrases: list[str] = Field(
        default_factory=list,
        description=(
            "Exact short phrases extracted verbatim from the customer's text. "
            "Used as source citations in the RAG chat interface."
        ),
    )
    intent: Literal["complaint", "compliment", "suggestion", "neutral"] = Field(
        ...,
        description=(
            "Intent classification of this answer. "
            "'complaint' drives urgency calculation and alert threshold checks."
        ),
    )
    emotions: list[str] = Field(
        default_factory=list,
        description=(
            "Emotions detected in the text "
            "(e.g., 'frustration', 'disappointment', 'satisfaction'). "
            "Can be empty if no strong emotion is present."
        ),
    )


class AnalyzeResponse(BaseModel):
    """
    Response body for POST /analyze.

    Returned after the full LangGraph pipeline completes successfully.

    Node backend uses this to:
        - Display real-time sentiment / urgency badges on the dashboard
        - Show urgency indicators on the recent-responses table
        - Know that MongoDB has been updated (FastAPI writes directly via $set)

    On pipeline failure, FastAPI returns HTTP 500 instead.
    The MongoDB document stays `status: "pending"` and the retry worker
    picks it up in the next scheduled run.
    """

    response_id: str = Field(
        ...,
        description="The response_id that was processed (echoed back for confirmation).",
    )
    status: Literal["done", "failed"] = Field(
        ...,
        description="Pipeline result. 'failed' is only returned with an error when the pipeline crashes mid-run.",
    )
    overall_sentiment: Literal["positive", "neutral", "negative"] = Field(
        ...,
        description="Overall sentiment derived from all ratings + text answer sentiments combined.",
    )
    sentiment_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Overall sentiment confidence score (0.0 to 1.0).",
    )
    urgency: Literal["low", "medium", "high"] = Field(
        ...,
        description=(
            "Urgency level. 'high' triggers the alert threshold check after pipeline completes. "
            "Logic: urgency=high when overall_sentiment=negative AND intent=complaint AND avg_rating ≤ 2."
        ),
    )
    is_complaint: bool = Field(
        ...,
        description="True if any text answer was classified with intent='complaint'.",
    )
    dominant_topic: str = Field(
        ...,
        description=(
            "The most frequently mentioned topic across all text answers. "
            "Derived using collections.Counter on all topic lists. "
            "'General' if no text answers exist."
        ),
    )
    per_text_analysis: dict[str, PerTextAnalysis] = Field(
        default_factory=dict,
        description=(
            "Per-question AI analysis for text-type answers only. "
            "Keyed by question_id. Empty dict if the form has no text questions."
        ),
    )
    summary: str = Field(
        ...,
        description="1–2 sentence factual summary of the entire feedback response. LLM-generated.",
    )
    processed_at: str = Field(
        ...,
        description="ISO 8601 timestamp of when pipeline processing completed.",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "response_id": "550e8400-e29b-41d4-a716-446655440000",
                "status": "done",
                "overall_sentiment": "negative",
                "sentiment_score": 0.81,
                "urgency": "high",
                "is_complaint": True,
                "dominant_topic": "Food Quality",
                "per_text_analysis": {
                    "uuid-q4": {
                        "label": "What could we do better?",
                        "raw_answer": "The biryani arrived cold and we waited almost 40 minutes.",
                        "sentiment": "negative",
                        "sentiment_score": 0.88,
                        "topics": ["food temperature", "wait time"],
                        "key_phrases": ["biryani arrived cold", "waited almost 40 minutes"],
                        "intent": "complaint",
                        "emotions": ["frustration", "disappointment"],
                    },
                    "uuid-q5": {
                        "label": "What did you enjoy most?",
                        "raw_answer": "The ambience was really nice and the staff were friendly.",
                        "sentiment": "positive",
                        "sentiment_score": 0.76,
                        "topics": ["ambience", "staff behavior"],
                        "key_phrases": ["really nice ambience", "staff were friendly"],
                        "intent": "compliment",
                        "emotions": ["satisfaction"],
                    },
                },
                "summary": "Customer experienced cold food and long wait times despite appreciating the ambience and staff friendliness.",
                "processed_at": "2026-04-15T14:30:07Z",
            }
        }
    }
