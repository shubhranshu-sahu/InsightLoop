# InsightLoop — AI Microservice (`ai-service`)

> Implementation guide for the FastAPI AI microservice.  
> Built by: Shubhranshu  
> Stack: FastAPI · LangGraph · LangChain · FAISS · Anthropic Claude  
> This document is self-contained. Start building directly from this.

---

## Table of Contents

1. [What This Service Does](#1-what-this-service-does)
2. [Folder Structure](#2-folder-structure)
3. [Dependencies](#3-dependencies)
4. [Environment Variables](#4-environment-variables)
5. [API Endpoints — Full Reference](#5-api-endpoints--full-reference)
6. [The Feedback Analysis Pipeline (LangGraph)](#6-the-feedback-analysis-pipeline-langgraph)
7. [The Chat System](#7-the-chat-system)
8. [Vector Store Design](#8-vector-store-design)
9. [Alert Threshold Logic](#9-alert-threshold-logic)
10. [Retry Worker](#10-retry-worker)
11. [Build Order](#11-build-order)

---

## 1. What This Service Does

Five responsibilities. Nothing more.

| Responsibility | Triggered By | Endpoint |
|---|---|---|
| Analyze a feedback response | Node backend (async, after save) | `POST /analyze` |
| Answer a natural language query about feedback | Node backend (from chat UI) | `POST /query` |
| Generate a form-level summary for reports | Node backend (on report generate) | `POST /summary` |
| Retry unprocessed responses | Internal cron on startup | Internal task |
| Health check | Node backend / monitoring | `GET /health` |

This service **never** talks to the frontend directly. Node backend is always in the middle.

---

## 2. Folder Structure

```
ai-service/
│
├── app/
│   ├── main.py                  ← FastAPI app init, middleware, router registration
│   ├── config.py                ← Settings loaded from .env using pydantic-settings
│   │
│   ├── routes/
│   │   ├── analyze.py           ← POST /analyze
│   │   ├── query.py             ← POST /query
│   │   ├── summary.py           ← POST /summary
│   │   └── health.py            ← GET /health
│   │
│   ├── pipeline/
│   │   ├── graph.py             ← LangGraph StateGraph definition
│   │   ├── state.py             ← FeedbackState TypedDict
│   │   └── nodes/
│   │       ├── analyze_text.py  ← Node 1: LLM call — all text analysis
│   │       ├── derive_overall.py← Node 2: rule-based — urgency, complaint, overall sentiment
│   │       ├── summarize.py     ← Node 3: LLM call — 1-2 line summary
│   │       └── embed_store.py   ← Node 4: embed document, write to vector store
│   │
│   ├── chat/
│   │   ├── engine.py            ← Chat logic (basic first, tools added later)
│   │   ├── tools/
│   │   │   ├── rag_tool.py      ← RAG retrieval tool (Phase 2)
│   │   │   └── data_tool.py     ← Quantitative query tool (Phase 3)
│   │   └── schema_context.py    ← Builds form schema description for LLM
│   │
│   ├── vector/
│   │   ├── store.py             ← FAISS vector store wrapper (init, add, search)
│   │   └── embedder.py          ← Embedding model wrapper
│   │
│   ├── db/
│   │   ├── mongo.py             ← MongoDB async connection (motor)
│   │   └── mysql.py             ← MySQL connection (aiomysql) — for reading questions + writing alerts
│   │
│   ├── schemas/
│   │   ├── analyze.py           ← Pydantic request/response for /analyze
│   │   ├── query.py             ← Pydantic request/response for /query
│   │   └── summary.py           ← Pydantic request/response for /summary
│   │
│   ├── alerts/
│   │   └── checker.py           ← Threshold logic, writes to MySQL alerts table
│   │
│   └── workers/
│       └── retry.py             ← Finds pending/failed responses, reprocesses them
│
├── data/
│   └── vectorstore/             ← FAISS index files (gitignored)
│
├── .env
├── requirements.txt
└── README.md
```

---

## 3. Dependencies

```txt
# requirements.txt

# Framework
fastapi==0.115.0
uvicorn[standard]==0.30.0

# LangChain / LangGraph
langchain==0.3.0
langchain-anthropic==0.3.0
langgraph==0.2.0
langsmith==0.1.0

# Vector store + embeddings
faiss-cpu==1.8.0
sentence-transformers==3.0.0

# Database drivers
motor==3.5.0          # async MongoDB
aiomysql==0.2.0       # async MySQL

# Validation
pydantic==2.8.0
pydantic-settings==2.4.0

# Utilities
python-dotenv==1.0.0
httpx==0.27.0         # async HTTP (if needed for internal calls)
APScheduler==3.10.4   # for retry cron job
```

---

## 4. Environment Variables

```env
# .env

# Server
PORT=8000

# Security — Node backend sends this header on every call
INTERNAL_SECRET=some_shared_secret_string

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# LangSmith (tracing + monitoring — set up from day one)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=insightloop-dev

# MongoDB (same instance as Node backend)
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=insightloop

# MySQL (same instance as Node backend — read questions, write alerts)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DB=insightloop

# Vector store
VECTOR_STORE_PATH=./data/vectorstore

# Embedding model (runs locally, no API cost)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# LLM model
LLM_MODEL=claude-sonnet-4-6

# Alert thresholds (tunable)
ALERT_HIGH_URGENCY_THRESHOLD=3      # if >= 3 high-urgency in 6h, create alert
ALERT_WINDOW_HOURS=6
```

---

## 5. API Endpoints — Full Reference

### Security

Every request from Node backend must include:
```
X-Internal-Secret: <INTERNAL_SECRET from .env>
```

FastAPI middleware checks this on every route. If missing or wrong → 403.

```python
# app/main.py
@app.middleware("http")
async def verify_internal_secret(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)   # health check is public
    secret = request.headers.get("X-Internal-Secret")
    if secret != settings.INTERNAL_SECRET:
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return await call_next(request)
```

---

### `GET /health`

Basic health check. Public — no auth required.

**Response `200`:**
```json
{
  "status": "ok",
  "service": "insightloop-ai",
  "vector_store": "loaded",
  "llm": "claude-sonnet-4-6"
}
```

---

### `POST /analyze`

Called by Node backend after saving a feedback response to MongoDB.  
This is the main pipeline endpoint. Runs the LangGraph graph.

**Request body:**
```json
{
  "response_id": "uuid-abc123",
  "form_id": "uuid-form456",
  "business_id": "uuid-biz789",
  "submitted_at": "2026-04-15T14:30:00Z",
  "answers": {
    "uuid-q1": {
      "label": "How was your overall experience?",
      "type": "rating",
      "value": 4
    },
    "uuid-q2": {
      "label": "Rate the food quality",
      "type": "rating",
      "value": 2
    },
    "uuid-q3": {
      "label": "Rate the service speed",
      "type": "rating",
      "value": 1
    },
    "uuid-q4": {
      "label": "What could we do better?",
      "type": "text",
      "value": "The biryani arrived cold and we waited almost 40 minutes."
    },
    "uuid-q5": {
      "label": "What did you enjoy most?",
      "type": "text",
      "value": "The ambience was really nice and staff were friendly."
    },
    "uuid-q6": {
      "label": "Would you recommend us?",
      "type": "yesno",
      "value": false
    }
  }
}
```

**Response `200`:**
```json
{
  "response_id": "uuid-abc123",
  "status": "done",
  "overall_sentiment": "negative",
  "sentiment_score": 0.81,
  "urgency": "high",
  "is_complaint": true,
  "dominant_topic": "Food Quality",
  "per_text_analysis": {
    "uuid-q4": {
      "sentiment": "negative",
      "sentiment_score": 0.88,
      "topics": ["food temperature", "wait time"],
      "key_phrases": ["biryani arrived cold", "waited almost 40 minutes"],
      "intent": "complaint",
      "emotions": ["frustration", "disappointment"]
    },
    "uuid-q5": {
      "sentiment": "positive",
      "sentiment_score": 0.76,
      "topics": ["ambience", "staff behavior"],
      "key_phrases": ["really nice ambience", "staff were friendly"],
      "intent": "compliment",
      "emotions": ["satisfaction"]
    }
  },
  "summary": "Customer experienced cold food with long wait times despite appreciating the ambience and staff friendliness.",
  "processed_at": "2026-04-15T14:30:07Z"
}
```

**Response `422`** — invalid request body (Pydantic validation failure)  
**Response `500`** — internal error (LLM failure, DB write failure etc.)

Node backend behavior on 500: logs the error, the MongoDB document stays `status: "pending"`, retry worker picks it up later.

---

### `POST /query`

Called by Node backend when business owner sends a message in the AI chat.

**Request body:**
```json
{
  "query": "What are the most common complaints this month?",
  "business_id": "uuid-biz789",
  "form_id": "uuid-form456",
  "session_id": "uuid-session-xyz",
  "chat_history": [
    {
      "role": "user",
      "content": "How many responses did we get this week?"
    },
    {
      "role": "assistant",
      "content": "You received 47 responses this week for this form."
    }
  ]
}
```

`chat_history` is the conversation so far — Node sends the full history on every turn. FastAPI is stateless; it does not store history itself. Node reads the session from MongoDB and sends it back each time.

**Response `200`:**
```json
{
  "answer": "The most common complaints this month are about food temperature (mentioned in 14 responses) and slow service during peak hours (mentioned in 9 responses).",
  "sources": [
    {
      "response_id": "uuid-abc123",
      "submitted_at": "2026-04-12T18:30:00Z",
      "snippet": "biryani arrived cold and we waited almost 40 minutes"
    },
    {
      "response_id": "uuid-def456",
      "submitted_at": "2026-04-11T13:00:00Z",
      "snippet": "food was cold by the time it reached our table"
    }
  ],
  "query_type": "qualitative",
  "tokens_used": 1152
}
```

`query_type` is either `"qualitative"` (answered via RAG) or `"quantitative"` (answered via data tool). The frontend may use this to decide how to render the response.

---

### `POST /summary`

Called when Node backend generates a report. Returns structured text that gets formatted into a PDF.

**Request body:**
```json
{
  "business_id": "uuid-biz789",
  "form_id": "uuid-form456",
  "date_from": "2026-04-01",
  "date_to": "2026-04-30"
}
```

**Response `200`:**
```json
{
  "form_title": "Dining Experience Feedback",
  "period": "April 2026",
  "total_responses": 142,
  "sentiment_breakdown": {
    "positive": 89,
    "neutral": 31,
    "negative": 22
  },
  "avg_ratings": {
    "uuid-q1": { "label": "Overall Experience", "avg": 3.8 },
    "uuid-q2": { "label": "Food Quality", "avg": 3.2 },
    "uuid-q3": { "label": "Service Speed", "avg": 2.9 }
  },
  "recommend_yes_percent": 71.8,
  "top_positives": [
    "Ambience consistently praised across responses",
    "Staff friendliness mentioned positively in 34 responses"
  ],
  "top_complaints": [
    "Food arriving cold — mentioned in 18 responses",
    "Long wait times during weekends — mentioned in 14 responses"
  ],
  "urgent_issues": [
    "3 customers reported billing discrepancies"
  ],
  "recommendations": [
    "Consider temperature checks before food is served",
    "Add weekend staffing to reduce wait times"
  ],
  "generated_at": "2026-04-30T23:59:00Z"
}
```

---

## 6. The Feedback Analysis Pipeline (LangGraph)

### Design Principles

- **Minimum LLM calls.** LLM calls are the bottleneck — latency and cost. Combine related tasks into one call where possible.
- **Rule-based where possible.** Urgency calculation, overall sentiment derivation — these don't need an LLM.
- **One graph run per feedback submission.** The graph runs end to end, updates MongoDB once at the end.

### Node Count and LLM Calls

| Node | Type | What it does |
|---|---|---|
| `analyze_text_node` | **1 LLM call** | Processes ALL text answers at once — sentiment, topics, key phrases, intent, emotions |
| `derive_overall_node` | **No LLM** | Computes overall_sentiment, urgency, is_complaint from ratings + text results |
| `summarize_node` | **1 LLM call** | Generates 1–2 sentence human summary of the whole response |
| `embed_store_node` | **No LLM** | Builds the vector document, embeds it, writes to FAISS + MongoDB |

**Total: 2 LLM calls per feedback response.** That's the minimum to get quality results.

---

### State Definition

```python
# app/pipeline/state.py
from typing import TypedDict, Optional

class FeedbackState(TypedDict):
    # Input — passed in when graph is invoked
    response_id:     str
    form_id:         str
    business_id:     str
    submitted_at:    str
    answers:         dict        # same structure as MongoDB answers map

    # Derived by analyze_text_node
    per_text_analysis: dict      # keyed by question_id, contains sentiment/topics/etc

    # Derived by derive_overall_node
    overall_sentiment:  str      # "positive" | "neutral" | "negative"
    sentiment_score:    float
    urgency:            str      # "low" | "medium" | "high"
    is_complaint:       bool
    dominant_topic:     str

    # Derived by summarize_node
    summary: str

    # Status tracking
    error:   Optional[str]
```

---

### Graph Definition

```python
# app/pipeline/graph.py
from langgraph.graph import StateGraph, END
from app.pipeline.state import FeedbackState
from app.pipeline.nodes.analyze_text import analyze_text_node
from app.pipeline.nodes.derive_overall import derive_overall_node
from app.pipeline.nodes.summarize import summarize_node
from app.pipeline.nodes.embed_store import embed_store_node

def build_feedback_graph():
    graph = StateGraph(FeedbackState)

    graph.add_node("analyze_text",   analyze_text_node)
    graph.add_node("derive_overall", derive_overall_node)
    graph.add_node("summarize",      summarize_node)
    graph.add_node("embed_store",    embed_store_node)

    graph.set_entry_point("analyze_text")

    graph.add_edge("analyze_text",   "derive_overall")
    graph.add_edge("derive_overall", "summarize")
    graph.add_edge("summarize",      "embed_store")
    graph.add_edge("embed_store",    END)

    return graph.compile()

feedback_graph = build_feedback_graph()
```

---

### Node 1 — `analyze_text_node`

One LLM call that processes every text question at once. Ratings and yes/no require no LLM — skip them here.

```python
# app/pipeline/nodes/analyze_text.py

SYSTEM_PROMPT = """
You are a feedback analysis engine. Analyze customer feedback text and return structured JSON.
Be precise. Base your analysis only on what the customer actually wrote.
Return ONLY valid JSON, no explanation, no markdown.
"""

def build_analysis_prompt(text_answers: list[dict]) -> str:
    """
    text_answers = [
        {"question_id": "uuid-q4", "label": "What could we do better?", "value": "biryani was cold"},
        {"question_id": "uuid-q5", "label": "What did you enjoy most?", "value": "ambience was nice"},
    ]
    """
    lines = ["Analyze the following customer feedback answers:\n"]
    for ans in text_answers:
        lines.append(f'Question: "{ans["label"]}"')
        lines.append(f'Answer: "{ans["value"]}"\n')

    lines.append("""
Return a JSON object with this exact structure:
{
  "<question_id>": {
    "sentiment": "positive" | "neutral" | "negative",
    "sentiment_score": <float 0.0 to 1.0>,
    "topics": [<list of 1-3 topic strings>],
    "key_phrases": [<list of exact short phrases from the text>],
    "intent": "complaint" | "compliment" | "suggestion" | "neutral",
    "emotions": [<list of emotion strings, can be empty>]
  }
}
""")
    return "\n".join(lines)


async def analyze_text_node(state: FeedbackState) -> FeedbackState:
    # Extract only text-type answers
    text_answers = [
        {"question_id": qid, **ans}
        for qid, ans in state["answers"].items()
        if ans["type"] == "text" and ans["value"].strip()
    ]

    if not text_answers:
        # No text answers — skip LLM call entirely
        state["per_text_analysis"] = {}
        return state

    prompt = build_analysis_prompt(text_answers)

    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=prompt)
    ])

    import json
    state["per_text_analysis"] = json.loads(response.content)
    return state
```

---

### Node 2 — `derive_overall_node`

No LLM. Pure logic. Fast.

```python
# app/pipeline/nodes/derive_overall.py

def derive_overall_node(state: FeedbackState) -> FeedbackState:
    answers = state["answers"]
    text_analysis = state.get("per_text_analysis", {})

    # --- Collect all rating values ---
    ratings = [
        ans["value"]
        for ans in answers.values()
        if ans["type"] == "rating"
    ]
    avg_rating = sum(ratings) / len(ratings) if ratings else None

    # --- Collect text sentiments ---
    text_sentiments = [v["sentiment"] for v in text_analysis.values()]
    neg_count = text_sentiments.count("negative")
    pos_count = text_sentiments.count("positive")

    # --- Overall sentiment ---
    # Ratings < 2.5 = strongly negative signal
    # Majority text negative = negative
    if (avg_rating and avg_rating < 2.5) or neg_count > pos_count:
        overall_sentiment = "negative"
        sentiment_score = round(neg_count / max(len(text_sentiments), 1), 2)
    elif (avg_rating and avg_rating >= 4.0) and pos_count >= neg_count:
        overall_sentiment = "positive"
        sentiment_score = round(pos_count / max(len(text_sentiments), 1), 2)
    else:
        overall_sentiment = "neutral"
        sentiment_score = 0.5

    # --- Urgency ---
    intents = [v["intent"] for v in text_analysis.values()]
    has_complaint = "complaint" in intents

    if overall_sentiment == "negative" and has_complaint and (avg_rating is None or avg_rating <= 2):
        urgency = "high"
    elif overall_sentiment == "negative" or has_complaint:
        urgency = "medium"
    else:
        urgency = "low"

    # --- Dominant topic ---
    all_topics = []
    for v in text_analysis.values():
        all_topics.extend(v.get("topics", []))
    from collections import Counter
    dominant_topic = Counter(all_topics).most_common(1)[0][0] if all_topics else "General"

    state["overall_sentiment"] = overall_sentiment
    state["sentiment_score"]   = sentiment_score
    state["urgency"]           = urgency
    state["is_complaint"]      = has_complaint
    state["dominant_topic"]    = dominant_topic

    return state
```

---

### Node 3 — `summarize_node`

Second and final LLM call. Generates a human-readable 1–2 sentence summary.

```python
# app/pipeline/nodes/summarize.py

async def summarize_node(state: FeedbackState) -> FeedbackState:
    # Build a compact description of what happened in this response
    parts = []

    ratings = {ans["label"]: ans["value"] for ans in state["answers"].values() if ans["type"] == "rating"}
    if ratings:
        rating_str = ", ".join(f'{label}: {val}/5' for label, val in ratings.items())
        parts.append(f"Ratings — {rating_str}")

    for qid, analysis in state["per_text_analysis"].items():
        label = state["answers"][qid]["label"]
        val   = state["answers"][qid]["value"]
        parts.append(f'On "{label}": "{val}" (Intent: {analysis["intent"]})')

    content = "\n".join(parts)

    prompt = f"""
Summarize this customer feedback in 1-2 sentences. Be factual and specific.
Do not start with "The customer". Write directly.

{content}
"""
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    state["summary"] = response.content.strip()
    return state
```

---

### Node 4 — `embed_store_node`

No LLM. Builds the vector document as readable prose, embeds it, writes to FAISS and MongoDB.

```python
# app/pipeline/nodes/embed_store.py

async def embed_store_node(state: FeedbackState) -> FeedbackState:
    # Build human-readable document for embedding
    doc_lines = [
        f"Form: {state['form_id']}",
        f"Submitted: {state['submitted_at']}",
        ""
    ]

    for qid, ans in state["answers"].items():
        if ans["type"] == "rating":
            doc_lines.append(f"Rating — {ans['label']}: {ans['value']}/5")
        elif ans["type"] == "yesno":
            val = "Yes" if ans["value"] else "No"
            doc_lines.append(f"{ans['label']}: {val}")

    doc_lines.append("")

    for qid, analysis in state.get("per_text_analysis", {}).items():
        label = state["answers"][qid]["label"]
        value = state["answers"][qid]["value"]
        topics_str = ", ".join(analysis.get("topics", []))
        phrases_str = ", ".join(analysis.get("key_phrases", []))
        doc_lines.append(f'Q: {label}')
        doc_lines.append(f'A: "{value}"')
        doc_lines.append(f'→ Sentiment: {analysis["sentiment"]} | Topics: {topics_str} | Key phrases: {phrases_str} | Intent: {analysis["intent"]}')
        doc_lines.append("")

    doc_lines.append(f"Overall: {state['overall_sentiment']} | Urgency: {state['urgency']} | Complaint: {state['is_complaint']} | Dominant topic: {state['dominant_topic']}")

    page_content = "\n".join(doc_lines)

    # Embed and add to FAISS
    from app.vector.store import vector_store
    from langchain.schema import Document

    doc = Document(
        page_content=page_content,
        metadata={
            "response_id":       state["response_id"],
            "form_id":           state["form_id"],
            "business_id":       state["business_id"],
            "submitted_at":      state["submitted_at"],
            "overall_sentiment": state["overall_sentiment"],
            "urgency":           state["urgency"],
            "is_complaint":      state["is_complaint"],
            "dominant_topic":    state["dominant_topic"]
        }
    )
    vector_store.add_documents([doc])
    vector_store.save()   # persist FAISS index to disk

    # Update MongoDB — write ai_analysis block
    from app.db.mongo import get_db
    db = await get_db()
    await db.responses.update_one(
        {"response_id": state["response_id"]},
        {"$set": {
            "ai_analysis.status":            "done",
            "ai_analysis.overall_sentiment": state["overall_sentiment"],
            "ai_analysis.sentiment_score":   state["sentiment_score"],
            "ai_analysis.urgency":           state["urgency"],
            "ai_analysis.is_complaint":      state["is_complaint"],
            "ai_analysis.dominant_topic":    state["dominant_topic"],
            "ai_analysis.per_text_analysis": state.get("per_text_analysis", {}),
            "ai_analysis.summary":           state.get("summary", ""),
            "ai_analysis.processed_at":      datetime.utcnow()
        }}
    )

    return state
```

---

## 7. The Chat System

Built in three phases. Start with Phase 1, which is already useful. Add phases as you go.

---

### Phase 1 — Basic Chat (Build This First)

No RAG yet. LLM gets a system prompt with form context and the chat history. Already useful for questions like "What does this feedback form collect?" or basic summaries the LLM can reason about without retrieval.

```python
# app/chat/engine.py

async def run_chat(
    query: str,
    business_id: str,
    form_id: str,
    chat_history: list[dict]   # [{"role": "user"|"assistant", "content": "..."}]
) -> dict:

    # Build form schema context
    schema_context = await build_schema_context(form_id)

    system_prompt = f"""
You are an AI analytics assistant for InsightLoop.
You help business owners understand their customer feedback data.

{schema_context}

Guidelines:
- Answer based only on what you know about the data or what is retrieved for you.
- Be specific and concise.
- If you don't have enough data to answer, say so clearly.
- Do not make up numbers or trends.
"""

    # Convert chat history to LangChain message format
    messages = [SystemMessage(content=system_prompt)]
    for msg in chat_history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))
    messages.append(HumanMessage(content=query))

    response = await llm.ainvoke(messages)

    return {
        "answer":      response.content,
        "sources":     [],
        "query_type":  "qualitative",
        "tokens_used": response.usage_metadata.get("total_tokens", 0) if hasattr(response, "usage_metadata") else 0
    }
```

---

### Phase 2 — Add RAG Tool

The LLM can now retrieve actual feedback text to answer questions. Convert `run_chat` to use a LangGraph agent with a retrieval tool.

The RAG tool:
```python
# app/chat/tools/rag_tool.py
from langchain.tools import tool

@tool
def retrieve_feedback(query: str, form_id: str, business_id: str, k: int = 8) -> str:
    """
    Retrieve semantically relevant customer feedback responses.
    Use this when the question is about what customers said, specific complaints,
    compliments, topics, or trends in their written responses.
    """
    from app.vector.store import vector_store

    results = vector_store.similarity_search(
        query,
        k=k,
        filter={"form_id": form_id, "business_id": business_id}
    )

    if not results:
        return "No relevant feedback found."

    lines = []
    for doc in results:
        lines.append(f"[{doc.metadata['submitted_at'][:10]}] {doc.page_content[:300]}")

    return "\n\n---\n\n".join(lines)
```

---

### Phase 3 — Add Quantitative Data Tool

The LLM can now query structured data from MongoDB and return numbers and chart data. This is what powers "show me average ratings" type questions.

```python
# app/chat/tools/data_tool.py
from langchain.tools import tool
import pandas as pd

@tool
async def query_feedback_data(question: str, form_id: str, business_id: str) -> str:
    """
    Use this tool when the question requires numbers, averages, counts, or trends from the data.
    Examples: average rating, count of complaints, sentiment breakdown, rating over time.
    Do NOT use for questions about what customers wrote — use retrieve_feedback for those.
    """
    from app.db.mongo import get_db
    db = await get_db()

    docs = await db.responses.find(
        {"form_id": form_id, "business_id": business_id, "ai_analysis.status": "done"},
        {"_id": 0, "answers": 1, "ai_analysis": 1, "submitted_at": 1, "response_id": 1}
    ).to_list(length=1000)

    if not docs:
        return "No processed responses found for this form."

    # Flatten into DataFrame
    rows = []
    for doc in docs:
        row = {
            "response_id":       doc["response_id"],
            "submitted_at":      pd.to_datetime(doc["submitted_at"]),
            "overall_sentiment": doc["ai_analysis"]["overall_sentiment"],
            "urgency":           doc["ai_analysis"]["urgency"],
            "is_complaint":      doc["ai_analysis"]["is_complaint"],
            "dominant_topic":    doc["ai_analysis"]["dominant_topic"]
        }
        for qid, ans in doc["answers"].items():
            col = f'{ans["type"]}::{ans["label"]}'
            row[col] = ans["value"]
        rows.append(row)

    df = pd.DataFrame(rows)

    # Give the LLM the DataFrame info and let it reason
    # Return a summary of what's available
    rating_cols = [c for c in df.columns if c.startswith("rating::")]
    stats = {
        "total_responses": len(df),
        "sentiment_counts": df["overall_sentiment"].value_counts().to_dict(),
        "urgency_counts":   df["urgency"].value_counts().to_dict(),
        "complaint_count":  int(df["is_complaint"].sum()),
        "topic_counts":     df["dominant_topic"].value_counts().head(5).to_dict(),
        "rating_averages":  {col.replace("rating::", ""): round(df[col].mean(), 2) for col in rating_cols}
    }

    return str(stats)
```

---

### Schema Context Builder

Reads from MySQL `questions` table. Called at the start of every chat query.

```python
# app/chat/schema_context.py

async def build_schema_context(form_id: str) -> str:
    from app.db.mysql import get_mysql_conn
    from app.db.mongo import get_db

    async with get_mysql_conn() as conn:
        async with conn.cursor() as cur:
            # Get form title
            await cur.execute("SELECT title FROM feedback_forms WHERE form_id = %s", (form_id,))
            form = await cur.fetchone()

            # Get all questions ordered
            await cur.execute(
                "SELECT question_id, question_text, question_type, order_index "
                "FROM questions WHERE form_id = %s ORDER BY order_index",
                (form_id,)
            )
            questions = await cur.fetchall()

    # Count responses from MongoDB
    db = await get_db()
    response_count = await db.responses.count_documents({
        "form_id": form_id,
        "ai_analysis.status": "done"
    })

    lines = [
        f'Form: "{form[0]}"',
        f'Total analyzed responses: {response_count}',
        '',
        'Questions in this form:'
    ]

    for q in questions:
        q_id, q_text, q_type, _ = q
        if q_type == "rating":
            lines.append(f'  [{q_id}] RATING (1-5): "{q_text}"')
        elif q_type == "text":
            lines.append(f'  [{q_id}] TEXT (open-ended): "{q_text}"')
        elif q_type == "yesno":
            lines.append(f'  [{q_id}] YES/NO: "{q_text}"')

    lines += [
        '',
        'AI-derived fields available per response:',
        '  - overall_sentiment: "positive" | "neutral" | "negative"',
        '  - urgency: "low" | "medium" | "high"',
        '  - is_complaint: true | false',
        '  - dominant_topic: string (most mentioned topic)',
        '',
        'Per text question (in per_text_analysis):',
        '  - sentiment, topics, key_phrases, intent, emotions'
    ]

    return '\n'.join(lines)
```

---

## 8. Vector Store Design

```python
# app/vector/store.py
from langchain_community.vectorstores import FAISS
from app.vector.embedder import get_embedder
from app.config import settings
import os

_store = None

def get_vector_store() -> FAISS:
    global _store
    if _store is not None:
        return _store

    embedder = get_embedder()
    path = settings.VECTOR_STORE_PATH

    if os.path.exists(path):
        _store = FAISS.load_local(path, embedder, allow_dangerous_deserialization=True)
    else:
        # Initialize empty store with a dummy document — FAISS needs at least one
        from langchain.schema import Document
        _store = FAISS.from_documents(
            [Document(page_content="init", metadata={"_init": True})],
            embedder
        )
        _store.save_local(path)

    return _store

vector_store = get_vector_store()
```

```python
# app/vector/embedder.py
from langchain_community.embeddings import HuggingFaceEmbeddings
from app.config import settings

_embedder = None

def get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
    return _embedder
```

**Filtering in FAISS:**  
FAISS doesn't support metadata filtering natively in all versions. The clean approach: use `similarity_search_with_score` and post-filter by `business_id` and `form_id` from metadata. Fetch more results than you need (k=30) then filter down to 8–10.

```python
def similarity_search_filtered(query: str, business_id: str, form_id: str, k: int = 8):
    # Fetch more, then filter
    results = vector_store.similarity_search(query, k=50)
    filtered = [
        doc for doc in results
        if doc.metadata.get("business_id") == business_id
        and doc.metadata.get("form_id") == form_id
        and not doc.metadata.get("_init")
    ]
    return filtered[:k]
```

---

## 9. Alert Threshold Logic

FastAPI writes alerts to MySQL after `embed_store_node` completes. Checked in a separate function called at the end of `/analyze`.

```python
# app/alerts/checker.py

async def check_and_create_alerts(state: FeedbackState):
    from app.db.mongo import get_db
    from app.db.mysql import get_mysql_conn
    from datetime import timedelta

    if state["urgency"] != "high":
        return   # only check when current response is high urgency

    db = await get_db()
    window_start = datetime.utcnow() - timedelta(hours=settings.ALERT_WINDOW_HOURS)

    count = await db.responses.count_documents({
        "form_id":              state["form_id"],
        "business_id":          state["business_id"],
        "ai_analysis.urgency":  "high",
        "submitted_at":         {"$gte": window_start}
    })

    if count >= settings.ALERT_HIGH_URGENCY_THRESHOLD:
        # Write alert to MySQL
        async with get_mysql_conn() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    INSERT IGNORE INTO alerts (business_id, form_id, alert_type, message)
                    VALUES (%s, %s, %s, %s)
                """, (
                    state["business_id"],
                    state["form_id"],
                    "high_urgency_spike",
                    f"{count} high-urgency complaints received in the last {settings.ALERT_WINDOW_HOURS} hours."
                ))
            await conn.commit()
```

`INSERT IGNORE` prevents duplicate alerts — if the alert for this threshold event already exists, it silently skips.

---

## 10. Retry Worker

Runs on FastAPI startup. Also re-runs every 30 minutes using APScheduler.

```python
# app/workers/retry.py
from datetime import datetime, timedelta
from app.pipeline.graph import feedback_graph
from app.db.mongo import get_db

async def retry_pending_responses():
    db = await get_db()
    cutoff = datetime.utcnow() - timedelta(minutes=5)

    pending = await db.responses.find({
        "ai_analysis.status": {"$in": ["pending", "failed"]},
        "submitted_at":       {"$lt": cutoff},
        "ai_analysis.retry_count": {"$lt": 3}
    }).to_list(length=100)

    print(f"[Retry Worker] Found {len(pending)} unprocessed responses")

    for doc in pending:
        # Increment retry count first
        await db.responses.update_one(
            {"response_id": doc["response_id"]},
            {"$inc": {"ai_analysis.retry_count": 1}}
        )
        try:
            state = {
                "response_id":  doc["response_id"],
                "form_id":      doc["form_id"],
                "business_id":  doc["business_id"],
                "submitted_at": doc["submitted_at"].isoformat(),
                "answers":      doc["answers"],
                "per_text_analysis": {},
                "overall_sentiment": "",
                "sentiment_score":   0.0,
                "urgency":           "",
                "is_complaint":      False,
                "dominant_topic":    "",
                "summary":           "",
                "error":             None
            }
            await feedback_graph.ainvoke(state)
            print(f"[Retry Worker] Successfully processed {doc['response_id']}")
        except Exception as e:
            print(f"[Retry Worker] Failed {doc['response_id']}: {e}")
            await db.responses.update_one(
                {"response_id": doc["response_id"]},
                {"$set": {"ai_analysis.status": "failed", "ai_analysis.error": str(e)}}
            )
```

Register in `main.py`:
```python
# app/main.py
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.workers.retry import retry_pending_responses

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run once on startup
    await retry_pending_responses()

    # Schedule every 30 minutes
    scheduler.add_job(retry_pending_responses, "interval", minutes=30)
    scheduler.start()

    yield

    scheduler.shutdown()

app = FastAPI(lifespan=lifespan, title="InsightLoop AI Service", version="1.0.0")
```

---

## 11. Build Order

Build strictly in this order. Each step is testable independently.

### Step 1 — Skeleton
- [ ] Set up FastAPI project, folder structure
- [ ] `config.py` loading `.env`
- [ ] `GET /health` returns `{"status": "ok"}`
- [ ] Internal secret middleware
- [ ] MongoDB connection (`motor`)
- [ ] MySQL connection (`aiomysql`)
- **Test:** `curl localhost:8000/health` returns 200

### Step 2 — Pipeline (core)
- [ ] `FeedbackState` TypedDict
- [ ] `analyze_text_node` — hardcode mock LLM response first, just test the node runs
- [ ] `derive_overall_node` — fully rule-based, no LLM, test immediately
- [ ] `summarize_node` — real LLM call
- [ ] LangGraph graph wired together
- [ ] Test by invoking graph directly with sample state (no HTTP yet)

### Step 3 — Embed + Store
- [ ] `embedder.py` — load sentence-transformers model
- [ ] `store.py` — FAISS init, add, save, load
- [ ] `embed_store_node` — build document, embed, write to FAISS, update MongoDB
- **Test:** Submit a test state, check FAISS has a document, check MongoDB has `ai_analysis.status: "done"`

### Step 4 — /analyze endpoint
- [ ] Pydantic request/response schemas
- [ ] Route calls graph, returns result
- **Test:** POST manually with Postman/curl using sample data matching the request schema

### Step 5 — Alert checker
- [ ] `checker.py` logic
- [ ] Wire into `/analyze` route after graph completes
- **Test:** Submit 3+ high-urgency responses, check MySQL `alerts` table

### Step 6 — Basic Chat
- [ ] `schema_context.py` — reads from MySQL questions
- [ ] `engine.py` Phase 1 — system prompt + history, no tools
- [ ] `/query` endpoint
- **Test:** Ask a general question, get coherent answer

### Step 7 — RAG Chat
- [ ] `rag_tool.py` — vector similarity search
- [ ] Wire tool into chat engine
- [ ] `/query` now returns `sources` array
- **Test:** Submit some responses first, then ask "what are complaints about?", verify sources appear

### Step 8 — Quantitative Tool
- [ ] `data_tool.py` — MongoDB → pandas → stats
- [ ] LLM decides when to use this tool vs RAG tool
- **Test:** Ask "what is the average food rating?", verify correct number returned

### Step 9 — /summary + Retry worker
- [ ] `/summary` endpoint
- [ ] `retry.py` + APScheduler wired into lifespan
- **Test:** Manually set a response to `status: "pending"`, wait 5 min or trigger manually

### Step 10 — LangSmith
- [ ] Set env vars, verify traces appearing in LangSmith dashboard
- [ ] Add run names to graph nodes for readable traces
- **This should be set up from Step 2 onwards — traces appear automatically once env vars are set**

---

*End of AI Service Document*