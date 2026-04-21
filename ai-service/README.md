# InsightLoop — AI Microservice (`ai-service`)

> Built by: **Shubhranshu**  
> Stack: FastAPI · LangGraph · LangChain · Anthropic Claude · FAISS · MongoDB (motor) · MySQL (aiomysql)  
> Role: AI processing, NLP pipeline, vector embeddings, RAG, alert generation  
> Port: `8000` (default)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Folder Structure](#3-folder-structure)
4. [Dependencies](#4-dependencies)
5. [Environment Variables](#5-environment-variables)
6. [Getting Started](#6-getting-started)
7. [API Endpoints](#7-api-endpoints)
   - [GET /health](#71-get-health)
   - [POST /analyze](#72-post-analyze)
   - [POST /query](#73-post-query)
   - [POST /summary](#74-post-summary)
8. [The Feedback Analysis Pipeline (LangGraph)](#8-the-feedback-analysis-pipeline-langgraph)
   - [Pipeline Overview](#81-pipeline-overview)
   - [State Definition](#82-state-definition)
   - [Node 1 — analyze_text_node](#83-node-1--analyze_text_node)
   - [Node 2 — derive_overall_node](#84-node-2--derive_overall_node)
   - [Node 3 — summarize_node](#85-node-3--summarize_node)
   - [Node 4 — embed_store_node](#86-node-4--embed_store_node)
9. [Database Design](#9-database-design)
   - [MySQL Tables (owned by Node backend)](#91-mysql-tables)
   - [MongoDB Collections (shared)](#92-mongodb-collections)
   - [Vector Store (owned by AI service)](#93-vector-store-faiss)
10. [Security — Internal Secret Auth](#10-security)
11. [Alert Threshold Logic](#11-alert-threshold-logic)
12. [Retry Worker](#12-retry-worker)
13. [Chat System (Phases)](#13-chat-system)
14. [LangSmith Tracing](#14-langsmith-tracing)
15. [Data Flow Diagrams](#15-data-flow-diagrams)
16. [Build Order](#16-build-order)
17. [Team Contracts](#17-team-contracts)

---

## 1. Project Overview

**InsightLoop** is an AI-powered feedback intelligence SaaS. Businesses create QR-based feedback forms, customers scan and submit, and the AI engine automatically processes every submission — extracting sentiment, topics, urgency, and key phrases — then stores the results in a way that enables semantic search (RAG) and natural-language querying.

### The Three Services

| Service | Technology | Who Builds | Port |
|---------|-----------|------------|------|
| Frontend | HTML · CSS · JS · Bootstrap · GSAP | Purvi + Samia | Static |
| Backend | Node.js · Express · MySQL · MongoDB | Purvi | 3000 |
| **AI Microservice** | **FastAPI · LangGraph · LangChain** | **Shubhranshu** | **8000** |

### What This Service Does — Five Responsibilities

| Responsibility | Triggered By | Endpoint |
|---|---|---|
| Analyze a feedback response | Node backend (async, after save) | `POST /analyze` |
| Answer a natural language query | Node backend (from chat UI) | `POST /query` |
| Generate a form-level summary | Node backend (on report generate) | `POST /summary` |
| Retry unprocessed responses | Internal cron on startup | Internal task |
| Health check | Node backend / monitoring | `GET /health` |

> **This service never talks to the frontend directly.** The Node backend is always the intermediary.

---

## 2. System Architecture

### Feedback Submission Data Flow

```
Customer scans QR → fills form → submits
        │
        ▼
Node Backend (Purvi)
        │
        ├── 1. Saves raw response to MongoDB (ai_analysis.status = "pending")
        │         └── Returns 200 OK to customer → they see "Thank You"
        │
        └── 2. Fires async call to FastAPI — no waiting
                    │
              ┌─────┴──────────────┐
              │ Success            │ Failure
              │                    │
              ▼                    ▼
  FastAPI runs LangGraph     status stays "pending"
  pipeline (4 nodes)         retry worker picks up later
        │
        ├── Updates MongoDB: ai_analysis.status = "done"
        ├── Writes to FAISS vector store
        └── Checks alert thresholds → writes to MySQL (if triggered)
```

### Chat Query Data Flow

```
Business Owner types query in AI Chat UI
        │
        ▼
Node Backend → POST /query to FastAPI (with chat history)
        │
        ▼
FastAPI chat engine
        ├── Phase 1: LLM with form schema context + history
        ├── Phase 2: + RAG tool (vector similarity search)
        └── Phase 3: + Data tool (MongoDB → pandas → stats)
        │
        └── Returns: answer + sources + query_type
```

---

## 3. Folder Structure

```
ai-service/
│
├── app/
│   ├── __init__.py
│   ├── main.py                  ← FastAPI app init, middleware, router registration, lifespan
│   ├── config.py                ← Settings loaded from .env using pydantic-settings
│   │
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── analyze.py           ← POST /analyze  (primary endpoint)
│   │   ├── query.py             ← POST /query    (Phase 2)
│   │   ├── summary.py           ← POST /summary  (Phase 2)
│   │   └── health.py            ← GET /health    (always built first)
│   │
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── graph.py             ← LangGraph StateGraph definition
│   │   ├── state.py             ← FeedbackState TypedDict
│   │   └── nodes/
│   │       ├── __init__.py
│   │       ├── analyze_text.py  ← Node 1: 1 LLM call — all text answer analysis
│   │       ├── derive_overall.py← Node 2: rule-based — urgency, complaint, overall sentiment
│   │       ├── summarize.py     ← Node 3: 1 LLM call — 1-2 line summary
│   │       └── embed_store.py   ← Node 4: embed document, write to FAISS + update MongoDB
│   │
│   ├── chat/
│   │   ├── __init__.py
│   │   ├── engine.py            ← Chat logic (Phase 1 basic → Phase 2 RAG → Phase 3 data)
│   │   ├── tools/
│   │   │   ├── rag_tool.py      ← RAG retrieval tool (Phase 2)
│   │   │   └── data_tool.py     ← Quantitative query tool (Phase 3)
│   │   └── schema_context.py    ← Builds form schema description for LLM prompt
│   │
│   ├── vector/
│   │   ├── __init__.py
│   │   ├── store.py             ← FAISS wrapper (init, add, search, save, load)
│   │   └── embedder.py          ← HuggingFace sentence-transformers wrapper (singleton)
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── mongo.py             ← Motor async MongoDB connection
│   │   └── mysql.py             ← aiomysql async connection pool
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── analyze.py           ← Pydantic request/response for /analyze
│   │   ├── query.py             ← Pydantic request/response for /query
│   │   └── summary.py          ← Pydantic request/response for /summary
│   │
│   ├── alerts/
│   │   ├── __init__.py
│   │   └── checker.py           ← Threshold logic, writes to MySQL alerts table
│   │
│   └── workers/
│       ├── __init__.py
│       └── retry.py             ← Finds pending/failed responses, reprocesses them
│
├── data/
│   └── vectorstore/             ← FAISS index files (gitignored — regenerated from MongoDB)
│
├── .env                         ← Your actual secrets (gitignored)
├── .env.example                 ← Template with all required vars (committed)
├── .gitignore
├── requirements.txt
└── README.md
```

---

## 4. Dependencies

```txt
# Framework
fastapi==0.115.0
uvicorn[standard]==0.30.0

# LangChain / LangGraph
langchain==0.3.0
langchain-anthropic==0.3.0
langchain-community==0.3.0
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

# Data processing (Phase 3)
pandas==2.2.0
```

Install:
```bash
pip install -r requirements.txt
```

---

## 5. Environment Variables

Copy `.env.example` to `.env` and fill in your values.

```env
# ── Server ──────────────────────────────────────────────────────
PORT=8000

# ── Security ────────────────────────────────────────────────────
# Node backend sends this header on every call: X-Internal-Secret: <value>
INTERNAL_SECRET=your_shared_secret_here

# ── LLM ─────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── LangSmith (Tracing + Monitoring) ────────────────────────────
# Set these from Day 1 — traces appear automatically once set
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=insightloop-dev

# ── MongoDB ─────────────────────────────────────────────────────
# Same instance as Node backend
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=insightloop

# ── MySQL ────────────────────────────────────────────────────────
# Same instance as Node backend
# FastAPI reads: questions table (for schema context)
# FastAPI writes: alerts table (after processing)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DB=insightloop

# ── Vector Store ────────────────────────────────────────────────
VECTOR_STORE_PATH=./data/vectorstore

# ── Embedding Model ─────────────────────────────────────────────
# Runs locally — no API cost, no key needed
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# ── LLM Model ───────────────────────────────────────────────────
LLM_MODEL=claude-sonnet-4-6

# ── Alert Thresholds ────────────────────────────────────────────
ALERT_HIGH_URGENCY_THRESHOLD=3    # if >= 3 high-urgency in window, create alert
ALERT_WINDOW_HOURS=6
```

---

## 6. Getting Started

### Prerequisites

- Python 3.11+
- MongoDB running locally (or connection URI)
- MySQL running locally (or connection string)
- Anthropic API key
- LangSmith account (optional but recommended)

### Setup

```bash
# 1. Clone the repo and navigate to ai-service
cd InsightLoop/ai-service

# 2. Create virtual environment
python -m venv .venv

# 3. Activate it
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Copy env template and fill in your values
cp .env.example .env

# 6. Run the server
uvicorn app.main:app --reload --port 8000
```

The API docs (Swagger UI) will be available at: `http://localhost:8000/docs`  
The ReDoc version: `http://localhost:8000/redoc`

---

## 7. API Endpoints

### Security

Every request from Node backend must include this header:
```
X-Internal-Secret: <INTERNAL_SECRET from .env>
```

FastAPI middleware checks this on every route. If missing or wrong → **403 Forbidden**.

The `/health` endpoint is **public** — no header required.

---

### 7.1 `GET /health`

Basic health check. Public endpoint — no authentication required.

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

### 7.2 `POST /analyze`

Called by Node backend **async (fire-and-forget)** after saving a feedback response to MongoDB.

This is the primary pipeline endpoint. Runs the full LangGraph graph (4 nodes, 2 LLM calls).

**Request Body:**
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

**Answer Types:**
- `"rating"` — `value` is integer `1–5`
- `"text"` — `value` is a non-empty string
- `"yesno"` — `value` is boolean `true/false`

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

**Error Responses:**
- `422 Unprocessable Entity` — Pydantic validation failure (malformed request)
- `500 Internal Server Error` — LLM failure, DB write failure, etc.

> On 500: Node backend logs the error. The MongoDB document stays `status: "pending"`. The retry worker will pick it up later.

---

### 7.3 `POST /query`

Called by Node backend when a business owner sends a message in the AI chat.

FastAPI is **stateless** — it does not store chat history. Node reads the session from MongoDB and sends the full history on every turn.

**Request Body:**
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

`query_type` is either `"qualitative"` (RAG retrieval) or `"quantitative"` (data tool / aggregation). The frontend may use this to adjust rendering.

---

### 7.4 `POST /summary`

Called when Node backend generates a report. Returns structured text formatted into a PDF.

**Request Body:**
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

## 8. The Feedback Analysis Pipeline (LangGraph)

### 8.1 Pipeline Overview

```
POST /analyze request
        │
        ▼
 ┌──────────────┐
 │ analyze_text │  LLM Call #1 — processes ALL text answers at once
 │    _node     │  → per_text_analysis (sentiment, topics, intent, emotions per question)
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │derive_overall│  NO LLM — pure Python logic
 │    _node     │  → overall_sentiment, urgency, is_complaint, dominant_topic
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │  summarize   │  LLM Call #2 — 1-2 sentence human summary
 │    _node     │  → summary string
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │  embed_store │  NO LLM — embeds doc + writes to FAISS + updates MongoDB
 │    _node     │  → FAISS index updated, MongoDB ai_analysis.status = "done"
 └──────┬───────┘
        │
        ▼
    END  →  Alert checker runs  →  Response returned
```

**Total: 2 LLM calls per feedback response.** That is the engineered minimum for quality results.

### Design Principles

- **Minimum LLM calls.** LLM calls are the cost and latency bottleneck. Batch all text questions into one prompt.
- **Rule-based where possible.** Urgency, overall sentiment derivation — these do not need an LLM.
- **One graph run per submission.** The graph runs end-to-end, MongoDB is updated once at the end.

---

### 8.2 State Definition

```python
# app/pipeline/state.py

from typing import TypedDict, Optional

class FeedbackState(TypedDict):
    # ── Input — passed in when graph is invoked ──────────────
    response_id:     str
    form_id:         str
    business_id:     str
    submitted_at:    str
    answers:         dict   # same structure as MongoDB answers map

    # ── Derived by analyze_text_node ─────────────────────────
    per_text_analysis: dict  # keyed by question_id

    # ── Derived by derive_overall_node ───────────────────────
    overall_sentiment:  str   # "positive" | "neutral" | "negative"
    sentiment_score:    float
    urgency:            str   # "low" | "medium" | "high"
    is_complaint:       bool
    dominant_topic:     str

    # ── Derived by summarize_node ────────────────────────────
    summary: str

    # ── Status tracking ──────────────────────────────────────
    error:   Optional[str]
```

---

### 8.3 Node 1 — `analyze_text_node`

**Type: 1 LLM call**

Extracts only `type == "text"` answers and processes them ALL in a single prompt. Ratings and yes/no get no LLM treatment here — they're handled rule-based in Node 2.

**What it extracts per text answer:**

| Field | Type | Example |
|-------|------|---------|
| `sentiment` | enum | `"negative"` |
| `sentiment_score` | float 0.0–1.0 | `0.88` |
| `topics` | list of strings | `["food temperature", "wait time"]` |
| `key_phrases` | list of exact phrases | `["biryani arrived cold", "waited 40 minutes"]` |
| `intent` | enum | `"complaint"` |
| `emotions` | list | `["frustration", "disappointment"]` |

If the form has no text questions, this node skips the LLM call entirely and returns `per_text_analysis: {}`.

**LLM Prompt Strategy:**
- System: "You are a feedback analysis engine. Return ONLY valid JSON."
- Human: All text questions + answers bundled into one prompt
- Returns JSON keyed by `question_id`

---

### 8.4 Node 2 — `derive_overall_node`

**Type: No LLM — pure Python logic**

Combines rating values and text sentiment results to derive overall fields.

**Overall Sentiment Logic:**
```
if avg_rating < 2.5  OR  neg_text_count > pos_text_count → "negative"
if avg_rating >= 4.0 AND pos_text_count >= neg_text_count  → "positive"
else                                                        → "neutral"
```

**Urgency Logic:**
```
if negative AND has_complaint AND avg_rating <= 2 → "high"
if negative OR has_complaint                      → "medium"
else                                              → "low"
```

**Dominant Topic:** Most common topic string across all text analyses (`collections.Counter`).

---

### 8.5 Node 3 — `summarize_node`

**Type: 1 LLM call**

Generates a 1–2 sentence factual summary of the entire feedback response.

**Context given to LLM:**
- All rating values with labels (e.g., "Food Quality: 2/5")
- Each text answer with its intent classification
- Instruction: "Be factual and specific. Do not start with 'The customer'."

---

### 8.6 Node 4 — `embed_store_node`

**Type: No LLM**

1. **Builds the vector document** — rich natural-language prose (not JSON). Example:

```
Form: uuid-form456
Submitted: 2026-04-15T14:30:00Z

Rating — How was your overall experience?: 4/5
Rating — Rate the food quality: 2/5
Would you recommend us?: No

Q: What could we do better?
A: "The biryani arrived cold and we waited almost 40 minutes."
→ Sentiment: negative | Topics: food temperature, wait time | Key phrases: biryani arrived cold, waited almost 40 minutes | Intent: complaint

Overall: negative | Urgency: high | Complaint: True | Dominant topic: Food Quality
```

2. **Embeds** the document using `sentence-transformers/all-MiniLM-L6-v2`
3. **Adds** to FAISS store with metadata (`response_id`, `form_id`, `business_id`, all derived fields)
4. **Saves** FAISS index to disk (`./data/vectorstore/`)
5. **Updates MongoDB** — `$set` on `ai_analysis` block only:
   - `status: "done"`
   - All derived fields
   - `per_text_analysis` object
   - `summary` string
   - `processed_at` timestamp

---

## 9. Database Design

### 9.1 MySQL Tables

MySQL is owned and managed by Purvi's Node backend. FastAPI **reads** from `questions` (for schema context) and **writes** to `alerts` (after processing).

#### `businesses`
```sql
CREATE TABLE businesses (
    business_id   VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    industry      VARCHAR(100),
    logo_url      VARCHAR(500),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### `feedback_forms`
```sql
CREATE TABLE feedback_forms (
    form_id     VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    business_id VARCHAR(36) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);
```

#### `questions`
> Critical for the AI service — this is what we read to know what questions a form has.

```sql
CREATE TABLE questions (
    question_id   VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    form_id       VARCHAR(36) NOT NULL,
    question_text VARCHAR(500) NOT NULL,
    question_type ENUM('rating', 'text', 'yesno') NOT NULL,
    order_index   TINYINT NOT NULL DEFAULT 0,
    is_required   BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

**Form Limits (enforced at application layer):**
- Max 5 `rating` questions per form
- Max 3 `text` questions per form
- Max 1 `yesno` question per form

#### `alerts`
> FastAPI writes to this table after processing each response.

```sql
CREATE TABLE alerts (
    alert_id    VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    business_id VARCHAR(36) NOT NULL,
    form_id     VARCHAR(36),
    alert_type  VARCHAR(100) NOT NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE,
    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE SET NULL
);
```

Alert types: `"high_urgency_spike"`, `"recurring_complaint"`, `"low_rating_drop"`

#### `qr_codes`
```sql
CREATE TABLE qr_codes (
    qr_id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    form_id       VARCHAR(36) NOT NULL UNIQUE,
    public_url    VARCHAR(500) NOT NULL,
    qr_image_path VARCHAR(500),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

#### `reports`
```sql
CREATE TABLE reports (
    report_id    VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    business_id  VARCHAR(36) NOT NULL,
    form_id      VARCHAR(36),
    title        VARCHAR(255) NOT NULL,
    date_from    DATE,
    date_to      DATE,
    file_path    VARCHAR(500),
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE,
    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE SET NULL
);
```

#### `admins`
```sql
CREATE TABLE admins (
    admin_id      VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 9.2 MongoDB Collections

#### Collection: `responses`

**The most important collection.** One document per customer submission.

**What Node (Purvi) writes on submit:**
```js
{
  "response_id":  "uuid-abc123",
  "form_id":      "uuid-form456",
  "business_id":  "uuid-biz789",
  "submitted_at": ISODate("2026-04-15T14:30:00Z"),

  "answers": {
    "uuid-question-1": {
      "label": "How was your overall experience?",
      "type":  "rating",
      "value": 4
    },
    "uuid-question-4": {
      "label": "What could we do better?",
      "type":  "text",
      "value": "The biryani arrived cold and we waited almost 40 minutes."
    },
    "uuid-question-6": {
      "label": "Would you recommend us?",
      "type":  "yesno",
      "value": false
    }
  },

  "ai_analysis": {
    "status":       "pending",   // ← Node creates this slot
    "processed_at": null,
    "retry_count":  0
  }
}
```

**What FastAPI writes after processing (`$set` only):**
```js
{
  "ai_analysis": {
    "status":            "done",
    "overall_sentiment": "negative",
    "sentiment_score":   0.81,
    "urgency":           "high",
    "is_complaint":      true,
    "dominant_topic":    "Food Quality",
    "per_text_analysis": {
      "uuid-question-4": {
        "sentiment":       "negative",
        "sentiment_score": 0.88,
        "topics":          ["food temperature", "wait time"],
        "key_phrases":     ["biryani arrived cold", "waited almost 40 minutes"],
        "intent":          "complaint",
        "emotions":        ["frustration", "disappointment"]
      }
    },
    "summary":    "Customer experienced cold food with long wait times despite appreciating the ambience.",
    "processed_at": ISODate("2026-04-15T14:30:07Z")
  }
}
```

**Required Indexes:**
```js
db.responses.createIndex({ "form_id": 1, "submitted_at": -1 })
db.responses.createIndex({ "business_id": 1, "submitted_at": -1 })
db.responses.createIndex({ "ai_analysis.status": 1 })
db.responses.createIndex({ "form_id": 1, "ai_analysis.overall_sentiment": 1 })
db.responses.createIndex({ "form_id": 1, "ai_analysis.urgency": 1 })
db.responses.createIndex({ "form_id": 1, "ai_analysis.is_complaint": 1 })
db.responses.createIndex({ "response_id": 1 }, { unique: true })
```

#### Collection: `chat_sessions`

One document per conversation session. Node creates sessions; FastAPI doesn't manage session documents directly — Node sends full history on every request.

```js
{
  "session_id":  "uuid-session-xyz",
  "business_id": "uuid-biz789",
  "form_id":     "uuid-form456",
  "form_title":  "Dining Experience Feedback",
  "created_at":  ISODate("2026-04-15T10:00:00Z"),
  "updated_at":  ISODate("2026-04-15T10:25:00Z"),
  "messages": [
    {
      "role":      "user",
      "content":   "What are the most common complaints this month?",
      "timestamp": ISODate("2026-04-15T10:00:00Z")
    },
    {
      "role":      "assistant",
      "content":   "The most common complaints this month are about food temperature...",
      "timestamp": ISODate("2026-04-15T10:00:06Z"),
      "sources": [
        { "response_id": "uuid-abc123", "submitted_at": "2026-04-12", "snippet": "biryani arrived cold" }
      ]
    }
  ]
}
```

#### Collection: `ai_queries`

Log of every individual AI query — for token usage tracking, debugging, admin stats.

```js
{
  "query_id":          "uuid-query-111",
  "session_id":        "uuid-session-xyz",
  "business_id":       "uuid-biz789",
  "form_id":           "uuid-form456",
  "query_text":        "What are the most common complaints this month?",
  "response_text":     "The most common complaints are...",
  "retrieved_chunks":  3,
  "prompt_tokens":     842,
  "completion_tokens": 310,
  "total_tokens":      1152,
  "model_used":        "claude-sonnet-4-6",
  "latency_ms":        3240,
  "created_at":        ISODate("2026-04-15T10:00:00Z")
}
```

---

### 9.3 Vector Store (FAISS)

Not a traditional database — a file-based index managed entirely by FastAPI.

**One vector document per feedback response** (created after AI processing).

**Why natural-language prose (not JSON)?**  
The embedding model converts text to a vector. Natural language retrieves better. When a business owner asks "complaints about cold food", the semantic similarity between that query and "biryani arrived cold" in the document is what enables accurate retrieval.

**Document format:**
```
Form: uuid-form456
Submitted: 2026-04-15

Rating — How was your overall experience?: 4/5
Rating — Rate the food quality: 2/5
Would you recommend us?: No

Q: What could we do better?
A: "The biryani arrived cold and we waited almost 40 minutes."
→ Sentiment: negative | Topics: food temperature, wait time | Intent: complaint

Overall: negative | Urgency: high | Complaint: True | Dominant topic: Food Quality
```

**Metadata attached to each document:**
```python
{
    "response_id":       "uuid-abc123",
    "form_id":           "uuid-form456",
    "business_id":       "uuid-biz789",
    "submitted_at":      "2026-04-15T14:30:00Z",
    "overall_sentiment": "negative",
    "urgency":           "high",
    "is_complaint":      True,
    "dominant_topic":    "Food Quality"
}
```

**Filtered search (post-filter approach — FAISS limitation):**
```python
# Fetch k=50 results, post-filter to get k=8 for the right business+form
results = vector_store.similarity_search(query, k=50)
filtered = [
    doc for doc in results
    if doc.metadata.get("business_id") == business_id
    and doc.metadata.get("form_id") == form_id
][:8]
```

**Storage path:** `ai-service/data/vectorstore/` — gitignored. Can be regenerated from MongoDB if lost.

---

## 10. Security

### Internal Secret Middleware

Every endpoint except `/health` requires the header:
```
X-Internal-Secret: <value from .env INTERNAL_SECRET>
```

```python
# app/main.py
@app.middleware("http")
async def verify_internal_secret(request: Request, call_next):
    if request.url.path in ["/health", "/docs", "/redoc", "/openapi.json"]:
        return await call_next(request)
    secret = request.headers.get("X-Internal-Secret")
    if secret != settings.INTERNAL_SECRET:
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return await call_next(request)
```

- This service is **not publicly accessible** — it runs on an internal port
- The Node backend is the only caller, and it includes the shared secret on every request
- The secret is set in `.env` on both the Node side and FastAPI side

---

## 11. Alert Threshold Logic

After every `/analyze` call completes, the alert checker runs. It only triggers when:

1. The current response has `urgency == "high"`
2. The count of high-urgency responses for that form in the last `ALERT_WINDOW_HOURS` hours is ≥ `ALERT_HIGH_URGENCY_THRESHOLD`

If threshold is crossed → `INSERT IGNORE INTO alerts` in MySQL.

`INSERT IGNORE` prevents duplicate alerts for the same threshold breach event.

**Example Alert Record:**
```json
{
  "business_id": "uuid-biz789",
  "form_id": "uuid-form456",
  "alert_type": "high_urgency_spike",
  "message": "5 high-urgency complaints received in the last 6 hours.",
  "is_read": false
}
```

Node backend reads these alerts to show on the dashboard. Business owner marks as read.

---

## 12. Retry Worker

Runs on FastAPI startup and every 30 minutes via APScheduler.

**Retry Query:**
```python
pending = await db.responses.find({
    "ai_analysis.status": {"$in": ["pending", "failed"]},
    "submitted_at": {"$lt": datetime.utcnow() - timedelta(minutes=5)},
    "ai_analysis.retry_count": {"$lt": 3}   # don't retry forever
}).to_list(length=100)
```

- 5-minute buffer: gives FastAPI time to process normally before retry kicks in
- 3-retry limit: prevents infinite loops on permanently broken responses
- On each retry: increments `retry_count`, re-runs full `feedback_graph.ainvoke(state)`
- On retry failure: sets `status: "failed"` with `error` message

---

## 13. Chat System

Built in three phases. Phase 1 is already useful. Phases 2 and 3 are progressive enhancements.

### Phase 1 — Basic Chat (No RAG)

LLM receives:
- System prompt with form schema context (built from MySQL `questions` table)
- Full chat history (sent by Node on every turn)
- Current user query

Already useful for: "What does this form collect?", "How many questions does it have?", general reasoning the LLM can do without retrieval.

### Phase 2 — Add RAG Tool

LLM can now retrieve actual feedback text. The `retrieve_feedback` tool does vector similarity search (filtered by `form_id` + `business_id`) and returns the k most relevant feedback documents.

Enables questions like:
- "What are customers saying about food quality?"
- "Show me complaints from last week"
- "What emotions appear most in responses?"

Response includes `sources` array — which responses were retrieved. Frontend can render these as expandable citation pills.

### Phase 3 — Add Quantitative Data Tool

LLM can now query structured data from MongoDB, flattened into a pandas DataFrame, to answer numerical questions.

Enables questions like:
- "What is the average food rating?"
- "How many complaints did we get this month?"
- "Are sentiment scores improving over time?"

### Schema Context Builder

Built dynamically from MySQL `questions` table. Injected into every chat system prompt so the LLM knows exactly what questions this form has.

```
Form: "Dining Experience Feedback"
Total analyzed responses: 142

Questions in this form:
  [uuid-q1] RATING (1-5): "How was your overall experience?"
  [uuid-q2] RATING (1-5): "Rate the food quality"
  [uuid-q3] RATING (1-5): "Rate the service speed"
  [uuid-q4] TEXT (open-ended): "What could we do better?"
  [uuid-q5] TEXT (open-ended): "What did you enjoy most?"
  [uuid-q6] YES/NO: "Would you recommend us?"

AI-derived fields available per response:
  - overall_sentiment: "positive" | "neutral" | "negative"
  - urgency: "low" | "medium" | "high"
  - is_complaint: true | false
  - dominant_topic: string (most mentioned topic)

Per text question (in per_text_analysis):
  - sentiment, topics, key_phrases, intent, emotions
```

---

## 14. LangSmith Tracing

Set these env vars before running **any** LLM calls — traces appear automatically:

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=insightloop-dev
```

LangSmith gives you:
- Full trace of every LangGraph run (node by node)
- Input/output at each node
- Token usage per call
- Latency per node
- Error traces when things fail

This is invaluable during development. Set it up from day one.

---

## 15. Data Flow Diagrams

### Who Writes What to MongoDB

```
responses collection:
┌─────────────────────────────────────────────┐
│             Response Document               │
│                                             │
│  ┌─────────────┐     ┌─────────────────┐   │
│  │   answers   │     │   ai_analysis   │   │
│  │             │     │                 │   │
│  │  Written by │     │  Created with   │   │
│  │    Node     │     │ status:pending  │   │
│  │   (Purvi)   │     │  by Node        │   │
│  │             │     │                 │   │
│  │  NEVER      │     │  Filled in by   │   │
│  │  touched    │     │  FastAPI        │   │
│  │  by FastAPI │     │  (Shubhranshu)  │   │
│  └─────────────┘     └─────────────────┘   │
└─────────────────────────────────────────────┘
```

### Complete Responsibility Table

| Data | Written by | Read by |
|------|-----------|---------|
| MySQL: businesses | Node (register) | Node (auth, dashboard) |
| MySQL: feedback_forms | Node (form builder) | Node, FastAPI (schema context) |
| MySQL: questions | Node (form builder) | Node (render form), **FastAPI (schema for LLM)** |
| MySQL: qr_codes | Node (on form save) | Node (QR display) |
| **MySQL: alerts** | **FastAPI** (after processing) | Node (dashboard alerts panel) |
| MySQL: reports | Node (on generate) | Node (reports page) |
| MongoDB: responses.answers | **Node** (on submit) | Node (raw view), FastAPI (to process) |
| **MongoDB: responses.ai_analysis** | **FastAPI** (after processing) | Node (analytics queries) |
| MongoDB: chat_sessions | Node (creates), FastAPI (reads) | Node (proxies to frontend) |
| **MongoDB: ai_queries** | **FastAPI** (logs every query) | Node (admin stats) |
| **Vector store** | **FastAPI** (after processing) | **FastAPI** (RAG retrieval) |

---

## 16. Build Order

Build strictly in this order. Each step is independently testable.

| Step | What | Test |
|------|------|------|
| 1 | Project skeleton (`config.py`, `main.py`, `GET /health`) | `curl localhost:8000/health` → 200 |
| 2 | DB connections (`mongo.py`, `mysql.py`) | Check startup logs |
| 3 | Pydantic schemas (`schemas/analyze.py`) | Import only |
| 4 | `FeedbackState` TypedDict | Import, inspect fields |
| 5 | Vector store (`embedder.py`, `store.py`) | `from app.vector.store import vector_store` |
| 6 | Pipeline nodes (1 → 2 → 3 → 4) | `feedback_graph.ainvoke(sample_state)` in Python shell |
| 7 | LangGraph graph wired | Run graph, check MongoDB `ai_analysis.status: "done"` |
| 8 | Alert checker | Submit 3+ high-urgency states, check MySQL `alerts` |
| 9 | `/analyze` route wired end-to-end | `POST /analyze` via Postman |
| 10 | LangSmith traces | Check traces dashboard after step 9 |

---

## 17. Team Contracts

### Contract: Node Backend → FastAPI

**When Node calls `/analyze`:**
- It sends the full `answers` map with `label`, `type`, and `value` on each answer
- The `ai_analysis` block already exists in MongoDB with `status: "pending"` before calling
- The call is **fire-and-forget** — Node does NOT wait for response before returning 200 to customer

**When FastAPI updates MongoDB:**
- It only touches `ai_analysis` fields via `$set`
- It never modifies `answers`, `form_id`, `business_id`, `response_id`, or `submitted_at`
- It writes `status: "done"` when pipeline completes, `status: "failed"` with `error` on exception

**When FastAPI writes alerts:**
- It writes directly to MySQL `alerts` table
- Node only reads alerts (for dashboard display) and updates `is_read`
- Node never creates alerts

### Contract: Shared MongoDB Instance

Both Node and FastAPI connect to the **same MongoDB instance**, same database.

- Node reads/writes `responses.answers`
- FastAPI reads `responses.answers` and writes `responses.ai_analysis`
- They **never write to each other's fields**

### Important: Labels Must Travel with Answers

When Purvi's Node backend saves answers to MongoDB, it must copy the question label from MySQL:

```js
// DO THIS — self-describing
"uuid-question-2": { "label": "Rate the food quality", "type": "rating", "value": 2 }

// NOT THIS — FastAPI can't interpret without a MySQL lookup
"uuid-question-2": { "type": "rating", "value": 2 }
```

This requirement means FastAPI can process responses without making a MySQL query for labels during the analysis pipeline.

---

*Last updated: April 2026 — Canonical spec per `ai-service.md` and `InsightLoop_Database_Design.md`*
