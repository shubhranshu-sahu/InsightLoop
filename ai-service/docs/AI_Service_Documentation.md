# InsightLoop AI Service — Comprehensive Documentation

This document serves as the single source of truth for the InsightLoop AI Service, a core component of the InsightLoop B.Tech minor project. It is intended for developers, teammates, and evaluators to understand the architecture, implementation, and engineering processes behind the AI features.

---

## SECTION 1: COMPONENT OVERVIEW

- **Component Name:** InsightLoop AI Service
- **Role in System:** This is the AI microservice responsible for analyzing customer feedback responses in real-time, extracting NLP insights (sentiment, intent, urgency), managing vector embeddings, and powering the natural-language RAG (Retrieval-Augmented Generation) chat system for business owners.
- **Consumers:** Only the Node.js backend communicates with this service. The frontend never calls the AI service directly.
- **Language & Framework:** Python 3.10+, FastAPI
- **Problem Solved:** It abstracts complex stateful LLM operations, vector database management, and asynchronous background tasks (like retries) away from the main CRUD Node backend, allowing the main backend to remain stateless and responsive.
- **Port:** Runs on `8000` (locally) and via dynamic ports on Render (production).
- **Security Mechanism:** Protected by an `X-Internal-Secret` header middleware on all routes (except the public `/health` probe), ensuring only the authenticated Node backend can trigger AI workflows.

---

## SECTION 2: TECHNOLOGY STACK

Every package was carefully chosen for performance, async support, and modern AI engineering standards:

- **FastAPI:** High-performance async API framework. Chosen for native async/await, Pydantic validation, and automatic OpenAPI Swagger docs.
- **LangChain (`langchain`, `langchain-google-genai`):** The LLM abstraction layer. Makes it easy to bind tools, manage messages, and interface with Gemini.
- **LangGraph (`langgraph`):** Stateful multi-agent workflow orchestration. Chosen over basic chains because it provides cyclic execution (for chat tools), persistent state, and observability.
- **Google Gemini (`gemini-2.0-flash`):** Primary LLM for text analysis, summarization, and chat. Highly capable, fast, and cost-effective.
- **Gemini Embeddings (`text-embedding-004`):** Used to convert feedback text into dense vectors for semantic search.
- **ChromaDB (`chromadb`):** Local vector database used during development. Easy to run without Docker.
- **Qdrant (`qdrant-client`, `langchain-qdrant`):** Production vector database deployed on Qdrant Cloud. Chosen because Chroma lacks robust metadata payload filtering, whereas Qdrant natively supports it.
- **Motor (`motor`):** Async MongoDB driver. Ensures database I/O doesn't block the FastAPI event loop.
- **aiomysql (`aiomysql`):** Async MySQL driver for reading relational schemas (questions) and eventually writing alerts.
- **Pydantic / `pydantic-settings`:** Strict typing, request validation, and loading environment variables cleanly.
- **python-dotenv:** Local `.env` loading.
- **APScheduler:** Scheduled job executor. Runs the retry worker for failed pipeline runs every 30 minutes.
- **Tenacity:** Retry logic with exponential backoff. Crucial for wrapping LLM network calls that may transiently fail.
- **LangSmith:** LLM observability. Traces every node execution, token usage, and latency.
- **httpx:** Async HTTP client (for any internal webhook/API needs).

---

## SECTION 3: FOLDER AND FILE STRUCTURE

```text
ai-service/
├── app/
│   ├── main.py              — FastAPI app init, CORS, middleware, router registration, lifespan
│   ├── config.py            — Pydantic Settings class loading all env vars from .env
│   ├── routes/
│   │   ├── health.py        — GET /health (public liveness check)
│   │   ├── analyze.py       — POST /analyze (triggers LangGraph feedback pipeline)
│   │   ├── query.py         — POST /chat/message (streaming SSE chat endpoint)
│   │   ├── thread.py        — POST /chat/thread, GET /chat/thread/{form_id}, GET /chat/threads/{business_id}
│   │   └── summary.py       — POST /summary (optional, for reports)
│   ├── pipeline/
│   │   ├── state.py         — FeedbackState TypedDict definition
│   │   ├── graph.py         — LangGraph StateGraph wiring all nodes together
│   │   └── nodes/
│   │       ├── analyze_text.py    — Node 1: LLM call analyzing all text answers in one prompt
│   │       ├── derive_overall.py  — Node 2: Rule-based urgency/sentiment/complaint derivation
│   │       ├── summarize.py       — Node 3: LLM call generating 1-2 sentence response summary
│   │       └── embed_store.py     — Node 4: Embed document, store in vector DB, update MongoDB
│   ├── chat/
│   │   ├── engine.py        — Core chat logic: load thread, build context, stream LLM, save messages
│   │   ├── graph.py         — LangGraph StateGraph defining the chat pipeline
│   │   ├── state.py         — ChatState TypedDict definition
│   │   ├── schema_context.py  — Reads MySQL questions table to build form schema description for LLM
│   │   ├── nodes/
│   │   │   ├── load_thread.py   — Node 1: Fetches thread history
│   │   │   ├── build_context.py — Node 2: Assembles LangChain messages and system prompts
│   │   │   ├── stream_llm.py    — Node 3: LLM call, tools decision, and SSE streaming
│   │   │   ├── execute_tools.py — Node 4: RAG tool execution
│   │   │   └── save.py          — Node 5: Saves response and manages lazy summarization
│   │   ├── utils/
│   │   │   ├── context_manager.py — Sliding window (last 20 messages) + lazy summarization at 30 messages
│   │   │   └── guardrails.py      — Input sanitization + injection pattern detection (pre-LLM)
│   │   └── tools/
│   │       ├── rag_tool.py    — Empty scaffold (refactored directly into chat/nodes/execute_tools.py)
│   │       └── data_tool.py   — Empty scaffold (Phase 3 quantitative analysis — postponed)
│   ├── vector/
│   │   ├── store.py         — ChromaDB/Qdrant vector store wrapper (init, add_documents, search)
│   │   └── embedder.py      — Gemini embedding model wrapper (singleton pattern)
│   ├── db/
│   │   ├── mongo.py         — Motor async MongoDB connection and get_db() helper
│   │   └── mysql.py         — aiomysql connection pool for reading questions and writing alerts
│   ├── schemas/
│   │   ├── analyze.py       — Pydantic models: AnalyzeRequest, AnalyzeResponse, PerTextAnalysis, AnswerItem
│   │   └── query.py         — Pydantic models: ChatMessageRequest, ThreadRequest, StreamEvent, etc.
│   ├── alerts/
│   │   └── checker.py       — Threshold logic: counts high-urgency responses, writes to MySQL alerts table
│   └── workers/
│       └── retry.py         — Finds pending/failed responses in MongoDB, reprocesses them via the pipeline
├── data/
│   └── vectorstore/         — ChromaDB local files (gitignored; production uses Qdrant cloud)
├── .env                     — All environment variables (never committed)
└── requirements.txt         — All Python dependencies with pinned versions
```

---

## SECTION 4: ENVIRONMENT VARIABLES

The service configuration is centrally managed via `app.config.Settings` overriding defaults via `.env`:

- `PORT` — Port for the FastAPI server (default 8000).
- `INTERNAL_SECRET` — Shared cryptographic secret with Node backend to protect all AI routes except `/health`.
- `GEMINI_API_KEY` — Google AI Studio API key used for generation and embeddings.
- `GEMINI_LLM_MODEL` — The LLM model string (e.g., `gemini-2.0-flash`).
- `GEMINI_EMBEDDING_MODEL` — The embedding model string (e.g., `models/text-embedding-004`).
- `LANGCHAIN_TRACING_V2` — Set to `true` to enable LangSmith observability.
- `LANGCHAIN_API_KEY` — LangSmith API key for exporting traces.
- `LANGCHAIN_PROJECT` — Project name for grouping traces in LangSmith.
- `MONGO_URI` — Connection string for MongoDB (shared with Node backend).
- `MONGO_DB_NAME` — MongoDB database name.
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB` — MySQL credentials for schema and alert lookups.
- `VECTOR_STORE_BACKEND` — `chroma` for local dev or `qdrant` for cloud deployment.
- `VECTOR_STORE_PATH` — Local file path for ChromaDB.
- `CHROMA_COLLECTION_NAME` — ChromaDB collection name.
- `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION_NAME` — Cloud configuration for Qdrant.
- `ALERT_HIGH_URGENCY_THRESHOLD` — Count of high-urgency responses to trigger a MySQL alert (default 3).
- `ALERT_WINDOW_HOURS` — Rolling time window for alerts (default 6).
- `CONTEXT_WINDOW_SIZE` — Chat history window size (default 20 messages).
- `SUMMARY_THRESHOLD` — When to trigger lazy context summarization (default 30 messages).


---

## SECTION 5: ALL API ENDPOINTS — COMPLETE REFERENCE

### 1. GET `/health`
- **Auth:** None (Public).
- **Caller:** Uptime monitors, load balancers, and Node backend liveness checks.
- **Request Body:** None.
- **Response:**
  ```json
  {
    "status": "ok",
    "service": "insightloop-ai",
    "llm_model": "gemini-2.0-flash",
    "embedding_model": "models/text-embedding-004",
    "vector_store": "qdrant"
  }
  ```
- **Logic:** Quickly asserts process liveness and echoes loaded `.env` configuration.

### 2. POST `/analyze`
- **Auth:** `X-Internal-Secret`.
- **Caller:** Node.js backend (fire-and-forget background call) immediately after MongoDB save.
- **Request Body:**
  ```json
  {
    "response_id": "550e8400-...",
    "form_id": "6ba7b810-...",
    "business_id": "6ba7b811-...",
    "submitted_at": "2026-04-15T14:30:00Z",
    "answers": {
      "uuid-q1": {"label": "Experience?", "type": "rating", "value": 4},
      "uuid-q4": {"label": "Feedback?", "type": "text", "value": "Food was cold"}
    }
  }
  ```
- **Response:** Full `AnalyzeResponse` JSON containing `overall_sentiment`, `urgency`, `is_complaint`, `per_text_analysis`, and `summary`.
- **Logic:** 
  1. Compiles the input into `FeedbackState`.
  2. Runs the LangGraph `feedback_graph` (Node 1 → 2 → 3 → 4).
  3. Optionally checks threshold and inserts a MySQL alert (if configured).
  4. Node 4 natively writes the `ai_analysis` block back to MongoDB.
- **Errors:** 500 on LLM or DB failure. The record stays `pending` in MongoDB.

### 3. POST `/chat/thread`
- **Auth:** `X-Internal-Secret`.
- **Caller:** Node.js backend when user opens the chat UI for a specific form.
- **Request Body:**
  ```json
  {
    "business_id": "biz-uuid",
    "form_id": "form-uuid",
    "form_title": "Dining Feedback"
  }
  ```
- **Response:** `ThreadResponse` containing full message history and an `is_new` boolean.
- **Logic:** Atomic `findOneAndUpdate` with `upsert=true` ensuring a single thread exists per `(business_id, form_id)`.

### 4. POST `/chat/message`
- **Auth:** `X-Internal-Secret`.
- **Caller:** Node.js backend proxying user's chat input.
- **Response:** StreamingResponse (SSE) - `text/event-stream`.
- **SSE Format:**
  ```text
  data: {"type": "token", "token": "Hello"}\n\n
  data: {"type": "token", "token": " world"}\n\n
  data: {"type": "done", "sources": [{"response_id": "...", "snippet": "..."}], "message_count": 4}\n\n
  ```
- **Logic:** 
  1. Pre-LLM Guardrail check.
  2. Save user message to MongoDB.
  3. Execute `chat_graph` (RAG search, LLM routing, SSE streaming).
  4. Intercept final output stream tags and format as SSE.
- **Errors:** Emits a `{"type": "error", "message": "..."}` SSE if failed mid-stream or at start.

### 5. GET `/chat/threads/{business_id}`
- **Auth:** `X-Internal-Secret`.
- **Caller:** Node.js backend rendering the sidebar of available chats.
- **Response:** `ThreadListResponse` containing `ThreadSummary` items.
- **Logic:** Reads from MongoDB `chat_threads`, projects only the `message_count` and the last single message for previews.

### 6. GET `/chat/thread/{business_id}/{form_id}`
- **Auth:** `X-Internal-Secret`.
- **Caller:** Node.js backend when clicking an old thread.
- **Response:** Full `ThreadResponse` containing all past messages.
- **Errors:** 404 if thread does not exist.

---

## SECTION 6: THE LANGGRAPH FEEDBACK ANALYSIS PIPELINE

### 6.1 Why LangGraph?
Instead of a simple synchronous function chain, LangGraph was chosen because:
- **Stateful TypedDict:** Type-safe passing of state between nodes.
- **Observable execution:** We can clearly trace transitions between analysis steps in LangSmith.
- **Fault Tolerance:** Granular retry blocks can be added per node in the future.
- **Decoupled Responsibilities:** Keeps LLM prompting distinctly separated from DB writes.

### 6.2 The `FeedbackState` TypedDict
- `response_id`, `form_id`, `business_id`, `submitted_at`, `answers`: Set via the initial REST payload.
- `per_text_analysis`: Map of QID -> LLM extracted stats (sentiment, intent, key phrases). Set by Node 1.
- `overall_sentiment`, `sentiment_score`, `urgency`, `is_complaint`, `dominant_topic`: Set by Node 2 via pure math.
- `summary`: Human readable 2-liner. Set by Node 3.
- `embedding_stored`: Boolean confirming ChromaDB/Qdrant write. Set by Node 4.

### 6.3 The 4 Pipeline Nodes

**Node 1: `analyze_text_node` (1 LLM Call)**
- **Input:** Filters `state["answers"]` for text answers only.
- **Logic:** Bundles all text responses into a single prompt for `gemini-2.0-flash`. Returns strict JSON extracting intent, emotions, key_phrases, and sentiment per question.
- **Output:** Populates `state["per_text_analysis"]`.
- **Design Decision:** Combining all text answers into one prompt saves significant latency and API costs compared to doing one LLM call per question.

**Node 2: `derive_overall_node` (0 LLM Calls)**
- **Input:** Reads rating values and the `per_text_analysis` from Node 1.
- **Logic:** Pure Python rules. Calculates average rating. Averages text sentiment.
- **Urgency Rule:** High if `overall_sentiment == negative AND has_complaint == true AND avg_rating <= 2.0`.
- **Output:** Populates the `overall_*` and `urgency` fields.

**Node 3: `summarize_node` (1 LLM Call)**
- **Input:** Snapshot of the entire state (ratings, raw texts, AI classifications).
- **Logic:** Sends the compiled snapshot to Gemini asking for a "1-2 sentence human-readable summary."
- **Output:** Populates `state["summary"]`.
- **Design Decision:** Summarization is kept isolated from Node 1 (extraction) because the summarizer benefits from knowing the mathematically derived `overall_sentiment` and `urgency`.

**Node 4: `embed_store_node` (0 LLM Calls)**
- **Input:** Entire pipeline state.
- **Logic:** 
  1. Translates the structured state into a natural language prose document (which improves semantic vector matching compared to JSON).
  2. Embeds and saves the document to ChromaDB/Qdrant alongside metadata tags.
  3. Executes a native MongoDB `$set` to persist the `ai_analysis` block and marks `status: "done"`. (Critically, it *never* overwrites the core `answers` map).
- **Output:** Sets `embedding_stored = True`.

### 6.4 Graph Wiring
Linear sequence strictly defined in `app/pipeline/graph.py`:
`START` → `analyze_text` → `derive_overall` → `summarize` → `embed_store` → `END`

### 6.5 LangSmith Observability
By setting `LANGCHAIN_TRACING_V2=true`, LangGraph natively exports the execution timeline of these nodes, highlighting exact prompt strings, input states, response JSONs, and latency to the LangSmith dashboard.


---

## SECTION 7: THE CHAT SYSTEM (PHASE 1 + PHASE 2)

### 7.1 Architecture Decision: One Thread per Form
Instead of global multi-session chats, the system enforces **one thread per form per business**. 
- **Reason:** Radically simplifies state management. The business owner can always open a form's chat and see their full historical context.
- **Ownership:** FastAPI strictly manages the chat lifecycle (`chat_threads` collection in MongoDB). The Node backend simply acts as a stateless SSE proxy.

### 7.2 Context Management Strategy
To prevent unbounded context window bloat and escalating token costs:
- **Sliding Window:** Only the last `20` raw messages (`CONTEXT_WINDOW_SIZE`) are sent verbatim to the LLM.
- **Lazy Summarization:** Triggered when the message count exceeds `30` (`SUMMARY_THRESHOLD`). 
- **Execution:** When triggered, a background LLM call extracts the oldest `10` messages from the window, compresses them into a paragraph, and appends this to the `context_summary` field. The system prompt seamlessly injects this summary.

### 7.3 Pre-LLM Guardrails (`guardrails.py`)
- **Length limits:** Pydantic strictly rejects inputs over 1000 characters.
- **Injection Detection:** A zero-token-cost, pure Python substring checker scans for known prompt injection patterns (e.g., "ignore previous instructions").
- **Handling:** If a pattern is detected, the pipeline halts immediately, streams a canned refusal message to the user as an SSE event, and records the assistant's refusal to MongoDB.

### 7.4 Schema Context (`schema_context.py`)
To prevent LLM hallucinations about what data actually exists:
- Reads the MySQL `questions` table to reconstruct a plain-English definition of the feedback form (e.g., "This form has 5 questions including a 1-5 rating on Food Quality...").
- Injected natively into every `SystemMessage`.
- Fallbacks to MongoDB historical data deduction if MySQL goes offline. Caches locally for 5 minutes per form.

### 7.5 Phase 1 — Basic Chat (No Retrieval)
Before RAG was added, the LLM replied solely using its `SystemMessage` schema context and sliding window history. It could answer structural questions but couldn't query exact user quotes.

### 7.6 Phase 2 — RAG Integration (Current Implementation)
RAG allows the chat engine to execute exact semantic similarity searches over past feedback.
- **Tool Implementation:** LangChain `@tool` (`search_feedback`) is bound to the LLM in `stream_llm.py`. 
- **Architectural Refactor:** Originally conceived as a standalone LangChain Agent, it was integrated directly into the `chat_graph` as a native LangGraph node (`execute_tools.py`) for better trace observability and deterministic execution.
- **Retrieval Logic:** Qdrant exact payload filters limit the search to `business_id` and `form_id`. Returns top-K semantically matching prose documents.
- **Citation Delivery:** Returned documents are appended directly into the `SystemMessage` for the final LLM synthesis, and their metadata (`response_id`, `snippet`) are pushed via the `done` SSE event so the frontend can hyperlink citations.

### 7.7 Phase 3 — Data Visualization (Planned, Not Implemented)
- An intended `data_tool.py` would allow the LLM to request pandas dataframe aggregations from MongoDB and emit `{type: "chart"}` SSE JSON packets.
- Postponed due to time constraints, though the tool scaffold and empty file currently exist in the codebase.

### 7.8 SSE Streaming Formats
Streaming allows the UI to render tokens instantly.
- **Token Event:** `{"type": "token", "token": "..."}`
- **Done Event:** `{"type": "done", "sources": [{"response_id": "...", ...}], "message_count": N}`
- **Error Event:** `{"type": "error", "message": "Failed to connect..."}`

---

## SECTION 8: MONGODB OPERATIONS

FastAPI interacts directly with a shared MongoDB instance (managed alongside the Node backend). 

### 8.1 `responses` Collection
- **Reads:** Reads `answers` map, `form_id`, `business_id`, and `submitted_at` when executing the analysis pipeline.
- **Writes (`$set`):** The pipeline explicitly writes only to the nested `ai_analysis` block. It sets `status: "done"` and all NLP attributes.
- **Critical Safety Rule:** The pipeline NEVER alters the root `answers` array, ensuring raw customer data is perfectly preserved.

### 8.2 `chat_threads` Collection
- **Schema:** Tracks `thread_id`, `business_id`, `form_id`, `form_title`, `messages` (array), `context_summary`, `message_count`, and timestamps.
- **Writes:** 
  - Created by FastAPI on first access via `$setOnInsert` for atomic concurrency safety.
  - User and LLM replies are appended via `$push`.
  - Background summarizations alter `context_summary` via `$set`.
- **Indexing:** Unique compound index on `(business_id, form_id)`.

---

## SECTION 9: MYSQL OPERATIONS

The platform utilizes a hybrid database approach. Relational structures live in MySQL.

- **Reads:** Queries the `feedback_forms` and `questions` tables to build the `schema_context` injected into the chat LLM.
- **Writes:** Intended to write threshold events into the `alerts` table.
- **Alert Logic:** The `app/alerts/checker.py` evaluates if the count of `urgency: "high"` responses over the last 6 hours exceeds the threshold (e.g., 3). 
- **Concurrency control:** If crossed, uses an `INSERT IGNORE INTO alerts` statement combined with a unique database constraint to ensure the business owner receives exactly one alert, suppressing duplicate spam. (Note: Currently exists as a silent stub while MySQL deployment scales).


---

## SECTION 10: VECTOR DATABASE

To provide semantic RAG features, the system integrates a robust vector database implementation abstracted behind `app/vector/store.py`.

- **Development:** Uses **ChromaDB**. Stores vectors locally in `data/vectorstore/`. Extremely easy to set up for offline coding.
- **Production:** Uses **Qdrant** deployed on Qdrant Cloud. 
- **Why the dual-database approach?** ChromaDB natively supports exact scalar filtering but lacks rich nested JSON metadata payload index filtering, which LangChain requires for certain cross-tenant queries. Qdrant provides enterprise-grade Payload Indexes ensuring one tenant's queries never bleed into another's data.
- **Data Shape:** The pipeline explicitly translates structured JSON answers into rich natural-language prose documents.
  - *Why Prose?* "The biryani arrived cold" embeds far closer to a user querying "complaints about cold food" than a JSON map `{"uuid-q4": {"label": "Feedback", "value": "biryani arrived cold"}}` would.
- **Fallback Logic:** If native DB-level filtering fails or degrades, the Python layer executes a broader search (`k=50`) and post-filters the metadata natively in memory.

---

## SECTION 11: RETRY WORKER

Network failures, LLM rate-limiting, and temporary DB disconnects are inevitable. A robust retry strategy prevents dropped responses.

- **Technology:** `APScheduler` wrapped in the FastAPI lifespan manager.
- **Execution:** Runs the `retry_pending_responses()` function once on application startup, and then on a CRON schedule every 30 minutes.
- **Query:** Selects all MongoDB responses where `ai_analysis.status` equals `pending` or `failed`, the `submitted_at` timestamp is older than 5 minutes (to avoid racing the live web-request), and `retry_count < 3`.
- **Logic:** Increments the retry count and executes the pipeline again. If it fails 3 times, sets `status` to `failed` permanently to stop infinite looping.

---

## SECTION 12: PROBLEMS FACED AND HOW THEY WERE SOLVED

### Problem 1: LLM returning malformed JSON in `analyze_text_node`
- **Issue:** Early Gemini iterations would occasionally wrap JSON in markdown backticks (````json ... ````), causing native `json.loads` to crash and abort the pipeline.
- **Solution:** Integrated `tenacity` for exponential backoff retries, updated system prompts to strictly forbid markdown formatting, and implemented a robust regex stripper `_extract_json_from_response` that sanitizes output prior to parsing.

### Problem 2: Vector DB metadata filtering inconsistency
- **Issue:** Migrating from ChromaDB (dev) to Qdrant (prod) broke the LangChain retrieval filters due to Qdrant expecting nested `metadata.` prefixes in its API queries.
- **Solution:** Abstracted the vector store entirely behind a factory in `store.py`. Implemented dynamic checks that intercept the retrieval call, format the `rest.FieldCondition` exactly as Qdrant 1.10+ expects (`metadata.business_id`), while keeping Chroma dictionaries simple for dev.

### Problem 3: Streaming SSE getting buffered by Nginx
- **Issue:** During deployment, the Node proxy received the full response instantly, but the browser sat waiting until the entire stream finished—ruining the real-time ChatGPT effect.
- **Solution:** Added the `X-Accel-Buffering: no` header in FastAPI to bypass Nginx proxy buffering, and updated the Node client to strictly utilize `responseType: 'stream'` via Axios.

### Problem 4: LangGraph Tool Calling producing 400 Errors
- **Issue:** In Phase 2 RAG, Gemini 3.x required a `thought_signature` when using bound tools. LangChain's async streaming accumulator `astream()` stripped this signature, causing the subsequent LLM execution to crash with an API 400 error.
- **Solution:** Subdivided the `stream_node` into two phases. Phase 1 (Tool Decision) uses the safe `ainvoke()` to preserve signatures. Phase 3 (Synthesis) sanitizes the execution chain by flattening the `ToolMessage` execution sequence into a clean `HumanMessage` context block before executing the final `astream()`.

### Problem 5: Context window growing unboundedly
- **Issue:** Large, prolonged chat interactions quickly exceeded API token rate limits and became sluggish.
- **Solution:** Implemented the `context_manager.py` sliding window (20 messages) and lazy summarization (at 30 messages) algorithm.

---

## SECTION 13: WHAT WAS PLANNED BUT DROPPED OR CHANGED

Due to time constraints and the complexity of core feature implementations for the final B.Tech evaluation, the following features were adapted or postponed:

1. **Phase 3 Data Visualization Tool:** The intended `data_tool.py` that would convert MongoDB aggregates into `Chart.js` compatible JSON payloads was designed but dropped from the active graph.
2. **Report Generation Endpoint (`/summary`):** The scaffolding exists, but business intelligence reports were deprioritized in favor of perfecting the real-time RAG chat UI.
3. **Voice-to-Text Feedback:** Envisioned in the original blueprint, this was removed from scope entirely due to frontend latency constraints.
4. **Standalone Agent RAG:** Originally planned as a separate LangChain Agent, the RAG feature was refactored into a direct LangGraph node (`execute_tools.py`) for superior stability and execution traceability.

---

## SECTION 14: DEPLOYMENT

The system utilizes a distributed cloud-native architecture:
- **FastAPI Platform:** Render (Free Tier Web Service). The `uvicorn` server is mapped dynamically.
- **Vector Store:** Qdrant Cloud Cluster (Free Tier), completely replacing ChromaDB in production.
- **MongoDB:** MongoDB Atlas Shared Cluster. Both the Node backend and this Python AI service point to the exact same connection URI.
- **MySQL:** AlwaysData Cloud. Used primarily for schema definition lookups.
- **Security:** `INTERNAL_SECRET` is secured as an environment variable in both the Render dashboard (for Python) and Vercel/Node environment, establishing a trusted inter-service communication link over the public internet.

---

## SECTION 15: TESTING DONE

- **REST Testing:** Core endpoints (`/health`, `/analyze`, `/chat/thread`) validated manually using Postman, ensuring JSON payloads respected Pydantic constraints.
- **SSE Streaming Testing:** Postman's native SSE client was used to confirm individual `{"type": "token"}` packets flowed continuously across the network without Nginx buffering.
- **LangSmith Tracing:** No traditional `unittest` or `pytest` suites were written due to time constraints and the non-deterministic nature of LLMs. Instead, LangSmith was integrated as the primary monitoring tool. Every pipeline run generates a trace, allowing visual verification of LLM output quality, prompt performance, and RAG retrieval accuracy.
