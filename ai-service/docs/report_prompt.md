# InsightLoop — Antigravity Prompts for Project Documentation

> **Purpose:** Give each of these prompts to Antigravity to generate a detailed status/documentation markdown file per component.
> The three generated files will be used together to write all 12 weekly progress reports and the final project report.
> Each prompt is self-contained — give the right one to the right Antigravity session with the relevant codebase open.

---

## PROMPT 1 — For Shubhranshu's Antigravity (AI Service / FastAPI)

Give this prompt to the Antigravity session that has your `ai-service/` folder open.

---

```
You are a technical documentation expert. I need you to generate an exhaustive, highly detailed markdown documentation file for the AI microservice component of InsightLoop — an AI-Powered Feedback Intelligence Platform built as a B.Tech minor project.

The audience for this document is:
1. Me (developer) — to write weekly progress reports and a final project report for college
2. My teammates — to understand what I built and how it connects to their components
3. College evaluators — who need to see proper software engineering process

Generate a single long markdown file with ALL of the following sections. Do not skip any. Be extremely detailed — this is the only documentation that will exist for this component.

---

SECTION 1: COMPONENT OVERVIEW
- What is this component called (InsightLoop AI Service)
- What is its role in the overall system
- Who calls it (Node backend only — never the frontend directly)
- What language and framework (Python, FastAPI)
- What problem does it solve that no other component can solve
- Port it runs on (8000)
- Security mechanism (X-Internal-Secret header on all routes except /health)

SECTION 2: TECHNOLOGY STACK
List every library/package used with version and exact reason why it was chosen:
- FastAPI — async, high performance, automatic OpenAPI docs
- LangChain — LLM abstraction layer
- LangGraph — stateful multi-agent workflow orchestration
- Google Gemini (via langchain-google-genai) — LLM for text analysis, summarization, chat
- Gemini text-embedding-004 — embedding model for vector storage
- ChromaDB — local vector database (dev), Qdrant used in production deployment
- Motor — async MongoDB driver
- aiomysql — async MySQL driver (for reading form schema and writing alerts)
- Pydantic / pydantic-settings — schema validation and settings management
- python-dotenv — environment variable loading
- APScheduler — scheduled retry job
- tenacity — retry logic with exponential backoff for LLM calls
- LangSmith — LLM call tracing and monitoring
- httpx — async HTTP client

SECTION 3: FOLDER AND FILE STRUCTURE
Show the complete folder tree with a one-line description of what every file does:

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
│   │   ├── context_manager.py — Sliding window (last 20 messages) + lazy summarization at 30 messages
│   │   ├── schema_context.py  — Reads MySQL questions table to build form schema description for LLM
│   │   ├── guardrails.py      — Input sanitization + injection pattern detection (pre-LLM, zero token cost)
│   │   └── tools/
│   │       ├── rag_tool.py    — RAG retrieval tool (Phase 2 — wraps vector store search with filters)
│   │       └── data_tool.py   — Data aggregation tool (Phase 3 — planned, not yet implemented)
│   ├── vector/
│   │   ├── store.py         — ChromaDB/Qdrant vector store wrapper (init, add_documents, search)
│   │   └── embedder.py      — Gemini embedding model wrapper (singleton pattern)
│   ├── db/
│   │   ├── mongo.py         — Motor async MongoDB connection and get_db() helper
│   │   └── mysql.py         — aiomysql connection pool for reading questions and writing alerts
│   ├── schemas/
│   │   ├── analyze.py       — Pydantic models: AnalyzeRequest, AnalyzeResponse, PerTextAnalysis, AnswerItem
│   │   └── query.py         — Pydantic models: ChatMessageRequest, ThreadRequest, StreamEvent
│   ├── alerts/
│   │   └── checker.py       — Threshold logic: counts high-urgency responses in 6h window, writes to MySQL alerts table
│   └── workers/
│       └── retry.py         — Finds pending/failed responses in MongoDB, reprocesses them via the pipeline
├── data/
│   └── vectorstore/         — ChromaDB local files (gitignored; production uses Qdrant cloud)
├── .env                     — All environment variables (never committed)
└── requirements.txt         — All Python dependencies with pinned versions

SECTION 4: ENVIRONMENT VARIABLES
List every variable in .env with what it controls:
- PORT
- INTERNAL_SECRET (shared with Node backend for route protection)
- GEMINI_API_KEY
- GEMINI_LLM_MODEL (e.g. gemini-2.0-flash)
- GEMINI_EMBEDDING_MODEL (e.g. models/text-embedding-004)
- LANGCHAIN_TRACING_V2
- LANGCHAIN_API_KEY
- LANGCHAIN_PROJECT
- MONGO_URI
- MONGO_DB_NAME
- MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
- VECTOR_STORE_PATH (local Chroma path)
- CHROMA_COLLECTION_NAME
- ALERT_HIGH_URGENCY_THRESHOLD (default 3)
- ALERT_WINDOW_HOURS (default 6)

SECTION 5: ALL API ENDPOINTS — COMPLETE REFERENCE
For every endpoint document:
- Method and path
- Authentication requirement
- Who calls it and when
- Complete request body (with example JSON)
- Complete response body (with example JSON)
- Internal logic step by step
- Error responses and what triggers them

Endpoints to document:
1. GET /health
2. POST /analyze
3. POST /chat/thread
4. POST /chat/message (SSE streaming)
5. GET /chat/thread/{business_id}/{form_id}
6. GET /chat/threads/{business_id}

SECTION 6: THE LANGGRAPH FEEDBACK ANALYSIS PIPELINE
This is the core AI engine. Document in full:

6.1 What is LangGraph and why it was chosen over a simple function chain
- Stateful execution with TypedDict state
- Node-by-node execution with observable transitions
- Built-in retry support and debuggability
- Integration with LangSmith for tracing

6.2 The FeedbackState TypedDict — every field, its type, which node sets it, what it means

6.3 The 4 nodes in the graph — for each node:
- Name and file
- Whether it makes an LLM call or is rule-based
- Exactly what input it reads from state
- Exactly what it computes
- Exactly what it writes back to state
- Why it was designed this way

Node 1: analyze_text_node
- Single LLM call that processes ALL text answers at once in one prompt
- Extracts per-question: sentiment, sentiment_score, topics, key_phrases, intent, emotions
- Skips if no text answers exist
- Prompt engineering decisions: why JSON-only output, how question_id keys are used

Node 2: derive_overall_node  
- Zero LLM calls — pure Python rule-based logic
- Averages all rating values
- Counts positive vs negative text sentiments
- Derives overall_sentiment, urgency, is_complaint, dominant_topic
- Exact urgency rules: high = negative + complaint + avg_rating ≤ 2

Node 3: summarize_node
- Second LLM call — generates 1-2 sentence human-readable summary
- Combines all question labels, values, and analysis results into one prompt
- Why summarization is a separate node rather than part of Node 1

Node 4: embed_store_node
- Zero LLM calls
- Builds rich natural-language prose document for embedding (explain why prose, not JSON)
- Embeds using Gemini text-embedding-004
- Stores in ChromaDB/Qdrant with metadata: response_id, form_id, business_id, submitted_at, overall_sentiment, urgency, is_complaint, dominant_topic
- Does MongoDB $set update on ai_analysis field (status: done + all analysis fields)
- Never touches the answers field in MongoDB — only ai_analysis

6.4 Graph wiring: START → analyze_text → derive_overall → summarize → embed_store → END

6.5 How LangSmith traces every node run for monitoring

SECTION 7: THE CHAT SYSTEM (PHASE 1 + PHASE 2)

7.1 Architecture decision: one thread per form per business
- Why not multiple sessions: simpler state management, owner has full context per form
- Thread stored in MongoDB chat_threads collection
- FastAPI owns the entire chat lifecycle (Node is a dumb SSE proxy)

7.2 Context management strategy:
- Sliding window: last 20 messages sent raw to LLM
- Lazy summarization: triggered when message_count > 30
- Summarization: LLM call on oldest 15 messages, appended to context_summary field
- How context_summary is injected into system prompt

7.3 Guardrails (implemented in guardrails.py):
- Input length limit: 1000 characters
- Injection detection: pattern list checked before any LLM call (zero token cost)
- System prompt rules: scope restriction to feedback data only

7.4 The schema_context.py module:
- Reads MySQL questions table for the selected form
- Counts MongoDB responses for that form (status: done)
- Builds a plain-English description of what data exists
- Injected into every LLM system prompt so the model knows what to query

7.5 Phase 1 — Basic chat (no RAG):
- System prompt + schema context + sliding window history + user message
- LLM answers from its understanding of the schema description alone

7.6 Phase 2 — RAG Integration (CURRENTLY IMPLEMENTED):
- rag_tool.py: wraps vector store similarity search with business_id + form_id filter
- How RAG was integrated into the LangGraph chat agent as a tool node
- Note: the original plan had rag_tool.py as a separate tool — it was instead refactored into a dedicated LangGraph node (explain this architectural change)
- Retrieves top-K most semantically similar feedback chunks
- Context block injected into system prompt: chunk text + metadata (sentiment, urgency, date)
- Sources returned in the done SSE event with response_id, submitted_at, snippet
- How post-retrieval filtering ensures only this business's responses are retrieved

7.7 Phase 3 — Data visualization tool (PLANNED, NOT YET IMPLEMENTED):
- Was planned as data_tool.py: MongoDB → pandas DataFrame → aggregation → chart JSON
- A chart SSE event type was designed to carry Chart.js-compatible JSON
- Feature postponed due to time constraints — code scaffold exists as empty file
- Would have enabled questions like "show me a bar chart of ratings"

7.8 SSE Streaming Format — all event types:
- token: { type: "token", token: "..." }
- done: { type: "done", sources: [...], message_count: N }
- chart: { type: "chart", chart_type: "bar", data: {...} } (Phase 3 — not yet sent)
- error: { type: "error", message: "..." }

SECTION 8: MONGODB OPERATIONS
Document every MongoDB collection this service reads from or writes to:

8.1 responses collection:
- What fields it reads (answers map, form_id, business_id, submitted_at)
- What fields it writes via $set (all ai_analysis.* fields)
- The critical rule: NEVER touches the answers field — only ai_analysis
- Retry query: find pending/failed with submitted_at older than 5 minutes and retry_count < 3

8.2 chat_threads collection:
- Complete document schema with every field
- Who creates it (FastAPI on first thread request)
- $push operations for appending messages
- $set for updating context_summary and updated_at
- Index: unique compound on (business_id, form_id)

SECTION 9: MYSQL OPERATIONS
- What tables are read (questions, feedback_forms)
- What table is written (alerts)
- The alert threshold logic: count of high-urgency responses in last 6 hours for a form
- INSERT IGNORE pattern and the unique constraint needed to prevent duplicate alerts

SECTION 10: VECTOR DATABASE
- ChromaDB used in development (local file-based)
- Qdrant used in production (cloud deployment at qdrant.io)
- Why the switch: Chroma has no built-in filtering on metadata in all versions; Qdrant has proper payload filtering
- How documents are structured for storage
- How filtered similarity search works: filter by business_id AND form_id, then top-K
- The fallback: fetch more than needed (k=50), post-filter in Python if DB-level filter isn't available

SECTION 11: RETRY WORKER
- APScheduler running on FastAPI startup (lifespan context manager)
- Runs retry_pending_responses() once on startup, then every 30 minutes
- Query: find responses where status is pending or failed, submitted_at older than 5 minutes, retry_count < 3
- Increments retry_count before attempting
- Sets status to failed with error message if all retries exhausted

SECTION 12: PROBLEMS FACED AND HOW THEY WERE SOLVED
Document each real problem encountered during development:

Problem 1: LLM returning malformed JSON in analyze_text_node
- Solution: tenacity retry with exponential backoff, strip markdown fences before JSON.parse, prompt engineering to enforce JSON-only output

Problem 2: Vector DB metadata filtering inconsistency between ChromaDB and Qdrant
- Solution: abstract the vector store behind store.py, deploy with Qdrant which supports proper payload filters, maintain local Chroma for development

Problem 3: Streaming SSE through Node proxy getting buffered by nginx
- Solution: Added X-Accel-Buffering: no header, ensured Node uses responseType: 'stream' with axios

Problem 4: MongoDB schema not accepting per_text_analysis field from FastAPI $set update
- Solution: Added per_text_analysis as Mixed type in Mongoose schema on the Node side

Problem 5: LangGraph tools/rag_tool.py architectural refactor
- Original plan: rag_tool.py as a standalone LangChain tool called by an agent
- Actual implementation: RAG logic was refactored into a dedicated LangGraph node inside the chat graph, making the flow more deterministic and observable
- The tools/rag_tool.py file exists as an empty scaffold from the original design

Problem 6: Context window growing unboundedly in long chat sessions
- Solution: Sliding window (last 20 messages) + lazy summarization triggered at 30 total messages

(Add any additional real problems you encountered during your implementation)

SECTION 13: WHAT WAS PLANNED BUT DROPPED OR CHANGED
- Report generation endpoint (/summary) — scaffolded, not prioritized
- Data visualization tool in chat (Phase 3) — designed, postponed
- Voice-to-text feedback — was in original vision document, removed from scope
- Admin monitoring dashboard — backend routes built, not featured in final product

SECTION 14: DEPLOYMENT
- Platform: Render (free tier web service)
- Environment variables set in Render dashboard
- Vector store: Qdrant cloud (free tier) replacing local ChromaDB
- MongoDB: Atlas (cloud) — same instance shared with Node backend
- MySQL: AlwaysData cloud — same instance shared with Node backend
- How the INTERNAL_SECRET is shared securely between Render deployments

SECTION 15: TESTING DONE
- How endpoints were tested (Postman for REST, Postman SSE for streaming)
- Evidence of streaming working (show the token events from actual Postman test)
- What unit tests exist or were skipped (and why, given time constraints)
- LangSmith dashboard as the monitoring/testing tool for LLM call quality

---

Format the output as a well-structured markdown file with clear headings and subheadings. Use tables where they help readability. Use code blocks for all JSON examples, code snippets, and folder trees. This file will be the single source of truth for writing 12 weekly reports and a final B.Tech project report.
```

---

## PROMPT 2 — For Purvi's Antigravity (Node.js Backend)

Give this prompt to the Antigravity session that has Purvi's `backend/` folder open.

---

```
You are a technical documentation expert. I need you to generate an exhaustive, highly detailed markdown documentation file for the Node.js backend component of InsightLoop — an AI-Powered Feedback Intelligence Platform built as a B.Tech minor project.

The audience for this document is:
1. Me (developer) — to write weekly progress reports and a final project report for college
2. My teammates — to understand what I built and how it connects to their components
3. College evaluators — who need to see proper software engineering process

Generate a single long markdown file with ALL of the following sections. Do not skip any. Be extremely detailed.

---

SECTION 1: COMPONENT OVERVIEW
- What this component does: serves as the primary application backend for all business logic, authentication, data management, and AI service coordination
- Who consumes it: the frontend (Vercel) via REST APIs, the AI microservice (receives webhooks/calls from Node)
- Who it calls: MySQL (AlwaysData cloud), MongoDB Atlas, FastAPI AI Service (Render)
- Technology: Node.js + Express.js
- Port: 5000 (local), deployed on Render

SECTION 2: TECHNOLOGY STACK
Every npm package installed, with version and exact reason:
- express — web framework
- cors — cross-origin request handling
- helmet — security headers
- dotenv — environment variable management
- mysql2 — MySQL driver (promise-based)
- mongoose — MongoDB ODM
- bcryptjs — password hashing
- jsonwebtoken — JWT creation and verification
- axios — HTTP client for calling FastAPI
- qrcode — QR code generation (note: now only public_url is stored; image generation was removed)
- crypto (built-in Node) — UUID generation via crypto.randomUUID()
- Any other packages actually installed

SECTION 3: FOLDER AND FILE STRUCTURE
Show the complete folder tree with a one-line description of every file:

backend/
├── src/
│   ├── app.js                    — Express app init, middleware, all route registrations
│   ├── config/
│   │   ├── db.js                 — MySQL connection pool (mysql2) with connectMySQL() and getPool()
│   │   └── mongo.js              — Mongoose connection with connectMongo()
│   ├── middleware/
│   │   ├── auth.js               — verifyToken: JWT verification, attaches req.business
│   │   ├── adminAuth.js          — verifyAdminToken: separate JWT for admin routes
│   │   └── errorHandler.js       — Global error handler middleware
│   ├── models/
│   │   ├── business.model.js     — MySQL: findByEmail, findById, create, update, updatePassword, findAll
│   │   ├── form.model.js         — MySQL: findAllByBusiness, findById, create, addQuestion, update, delete
│   │   ├── qr.model.js           — MySQL: findByFormId, create, deleteByFormId (stores only public_url now)
│   │   ├── feedback.model.js     — MySQL: getPublicForm only (response functions removed — MongoDB handles responses)
│   │   ├── response.model.js     — MongoDB Mongoose schema for responses collection
│   │   └── admin.model.js        — MySQL: findByEmail, findById, create
│   ├── controllers/
│   │   ├── auth.controller.js    — register, login, logout, getProfile, updateProfile, changePassword
│   │   ├── forms.controller.js   — getAllForms, createForm, getFormById, updateForm, deleteForm
│   │   ├── qr.controller.js      — getQRCode, generateQR (internal helper)
│   │   ├── feedback.controller.js — getFormForCustomer (public JSON schema for feedback.html)
│   │   ├── responses.controller.js — submitResponse, getResponsesByForm, getResponseById, getResponsesByBusiness
│   │   ├── analytics.controller.js — getDashboardStats, getSentimentTrend, getFormsPerformance, getRecentResponses, getFormAnalytics
│   │   ├── alerts.controller.js  — getAlerts, markAlertRead, markAllAlertsRead
│   │   ├── chat.controller.js    — getOrCreateThread, chatMessage (SSE proxy), listThreads, getThread
│   │   ├── reports.controller.js — generateReport (placeholder — feature dropped)
│   │   └── admin.controller.js   — login, getAllBusinesses, getPlatformStats, suspendBusiness, deleteBusiness
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── forms.routes.js
│   │   ├── feedback.routes.js
│   │   ├── responses.routes.js
│   │   ├── analytics.routes.js
│   │   ├── alerts.routes.js
│   │   ├── chat.routes.js        — NEW: replaces old ai.routes.js
│   │   ├── qr.routes.js
│   │   ├── reports.routes.js
│   │   └── admin.routes.js
│   └── (any other files that actually exist in your codebase)
└── .env

SECTION 4: ENVIRONMENT VARIABLES
Every variable in .env with what it does:
- PORT
- NODE_ENV
- JWT_SECRET
- MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB
- MONGO_URI
- AI_SERVICE_URL (FastAPI Render URL)
- INTERNAL_SECRET (shared with FastAPI for X-Internal-Secret header)
- FRONTEND_BASE_URL (Vercel URL — used to construct QR public_url)

SECTION 5: DATABASE ARCHITECTURE
5.1 MySQL — what it stores and why:
- businesses table (auth, profile)
- feedback_forms table (form config)
- questions table (form schema — critical: question_id UUIDs here are the keys in MongoDB answers map)
- qr_codes table (only stores public_url now — no image)
- alerts table (written by FastAPI, read by Node)
- reports table (exists but unused — feature dropped)
- admins table (platform admin — not featured in final product)

Show CREATE TABLE SQL for every table.

5.2 MongoDB — what it stores and why:
- responses collection: one document per customer submission, variable schema per form
- chat_threads collection: one thread per (business_id, form_id) pair

Show the complete Mongoose schema for response.model.js including all ai_analysis subfields (especially per_text_analysis which was added later to accommodate FastAPI output).

Note the key design decision: MySQL owns structure/config, MongoDB owns data/content.

5.3 Why both databases are needed — the reasoning:
- MySQL: fixed schema, relational, perfect for auth, form config, normalized questions
- MongoDB: flexible schema, perfect for responses where the shape changes per form (dynamic question keys)

SECTION 6: ALL API ENDPOINTS — COMPLETE REFERENCE
For every single registered route, document:
- Method and full path
- Auth requirement (public / JWT / admin JWT)
- Who calls it (frontend page name or internal)
- Complete request body with example JSON
- Complete response body with example JSON
- What the controller does step by step
- Error responses

Auth routes:
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- PUT /api/auth/profile
- PUT /api/auth/change-password

Form routes:
- GET /api/forms
- POST /api/forms (include: creates form + questions + QR record in one transaction)
- GET /api/forms/:form_id
- PUT /api/forms/:form_id
- DELETE /api/forms/:form_id

QR route:
- GET /api/qr/:form_id

Feedback routes (public):
- GET /api/feedback/form/:form_id (returns JSON schema for feedback.html)

Responses routes:
- POST /api/responses/submit (PUBLIC — the correct submission endpoint)
- GET /api/responses/form/:form_id
- GET /api/responses/:response_id
- GET /api/responses/business/:business_id

Analytics routes:
- GET /api/analytics/dashboard
- GET /api/analytics/sentiment-trend?days=&form_id=
- GET /api/analytics/forms-performance
- GET /api/analytics/recent-responses?limit=
- GET /api/analytics/form/:form_id

Alerts routes:
- GET /api/alerts
- PATCH /api/alerts/read-all  (NOTE: must be registered BEFORE /:alert_id/read)
- PATCH /api/alerts/:alert_id/read

Chat routes (NEW — replaced old /api/ai routes):
- POST /api/chat/thread
- POST /api/chat/message (SSE streaming proxy)
- GET /api/chat/threads
- GET /api/chat/thread/:form_id

Admin routes (built but not featured):
- POST /api/admin/login
- GET /api/admin/businesses
- GET /api/admin/stats
- PATCH /api/admin/businesses/:id/suspend
- DELETE /api/admin/businesses/:id

SECTION 7: THE FEEDBACK SUBMISSION FLOW — CRITICAL
This section is very important. Document the complete flow:

7.1 The two submission routes problem and how it was resolved:
- feedback.controller.js had submitFeedback saving to MySQL (WRONG — old approach)
- responses.controller.js has submitResponse saving to MongoDB (CORRECT — current)
- How the conflict was identified and resolved
- Which route is now active: POST /api/responses/submit
- What was removed: POST /api/feedback/submit unregistered from routes

7.2 The correct submission flow step by step:
1. Customer submits form on feedback.html
2. Frontend sends { form_id, answers: { "uuid-q": { value: ... } } }
3. Node looks up form in MySQL → gets business_id and all question labels/types
4. Node enriches each answer: { label, type, value } per question_id
5. Node saves MongoDB document with ai_analysis.status = "pending"
6. Node returns 201 immediately (customer sees Thank You screen)
7. Fire-and-forget: axios.post to FastAPI /analyze with enriched answers map
8. FastAPI processes asynchronously → $set updates MongoDB ai_analysis field

7.3 Why the enriched answers map matters:
- question_id as key links MySQL schema to MongoDB data
- label + type stored with each answer makes documents self-describing
- FastAPI reads it without needing a MySQL lookup

SECTION 8: ANALYTICS — MONGODB AGGREGATIONS
For each analytics endpoint, show the actual MongoDB aggregation pipeline used:

8.1 Dashboard stats: total responses, this week, today, complaints this month, sentiment breakdown 30d, previous 30d (for delta), urgency 30d, top topics 30d, active forms (MySQL), unread alerts (MySQL)

8.2 Sentiment trend: daily grouping by date string and sentiment, zero-filling missing dates in Node after aggregation

8.3 Forms performance: per-form sentiment counts, complaint counts, last_response_at merged with MySQL form titles

8.4 Recent responses: top N sorted by submitted_at, form_title joined from MySQL

8.5 Form analytics: form-scoped version of dashboard, plus rating_distribution computed in Node by iterating over answer.type === 'rating' values

SECTION 9: CHAT PROXY — SSE STREAMING
Document the chat controller in full:

9.1 Why Node doesn't generate the chat response itself — FastAPI owns the LLM and vector search

9.2 The SSE pipe implementation:
- axios with responseType: 'stream'
- res.setHeader('Content-Type', 'text/event-stream')
- res.setHeader('X-Accel-Buffering', 'no') — critical for Render/nginx not buffering
- fastApiResponse.data.pipe(res) — direct pipe, no buffering in Node

9.3 What happens to chat history — FastAPI writes to MongoDB; Node reads from MongoDB for GET /api/chat/threads and GET /api/chat/thread/:form_id (no FastAPI call for reads)

9.4 The chat_thread.model.js Mongoose schema used for these reads

SECTION 10: CHANGES FROM ORIGINAL PLAN
Things that changed from the initial architecture/design:

Change 1: MySQL-only responses → MongoDB responses
- Original plan stored responses in MySQL feedback_responses and answers tables
- Changed to MongoDB because response schema is dynamic (different questions per form)
- Old code still partially exists (feedback.controller.js, feedback.model.js response functions) but routes were unregistered

Change 2: QR image generation removed
- Originally generated PNG files saved to /uploads/qrcodes/
- Changed to storing only public_url — frontend generates QR image client-side using qrcode.js
- qr_codes table simplified: removed qr_image_path column

Change 3: /api/ai/* routes replaced by /api/chat/* routes
- Old ai.routes.js used session-based multi-session approach
- New chat.routes.js uses thread-per-form approach matching FastAPI's design
- Old routes removed from app.js

Change 4: Reports endpoint is a placeholder
- /api/reports/generate exists but returns a placeholder text file
- PDF generation was dropped — no file storage solution was set up in time

Change 5: Admin panel built but not featured
- All admin routes and controllers exist and work
- Dropped from final product scope and college report to simplify the demonstration

SECTION 11: PROBLEMS FACED AND HOW THEY WERE SOLVED
Document each real problem:

Problem 1: question_id integers vs UUIDs
- MySQL auto-increment IDs were used initially
- Changed to VARCHAR(36) with DEFAULT (UUID()) after realizing integer IDs couldn't be used as MongoDB answer map keys
- Explain the data integrity implication

Problem 2: MySQL DEFAULT (UUID()) requires MySQL 8.0+
- What happened when trying to use this on an older MySQL server
- How it was resolved

Problem 3: MongoDB $set update stripping per_text_analysis
- FastAPI wrote per_text_analysis but Mongoose schema didn't include it
- Fixed by adding per_text_analysis as Mixed type in response.model.js

Problem 4: alerts.routes.js route conflict
- PATCH /read-all was being matched as PATCH /:alert_id/read with alert_id = "read-all"
- Fixed by registering /read-all before /:alert_id/read in the router

Problem 5: CORS in production
- Vercel frontend could not call Render backend
- Fixed by setting appropriate CORS origin in app.js

Problem 6: SSE responses being buffered by Render's nginx
- Chat streaming was arriving all at once instead of token-by-token
- Fixed with X-Accel-Buffering: no header

(Add any other real problems you encountered)

SECTION 12: DEPLOYMENT
- Platform: Render (free tier web service)
- MySQL: AlwaysData cloud (how connection string was configured)
- MongoDB: Atlas (how URI was configured)
- Environment variables: set in Render dashboard
- How FRONTEND_BASE_URL is set to Vercel production URL for correct QR generation
- Cold start behavior on Render free tier (15-second delay on first request)

SECTION 13: WHAT WAS SKIPPED OR DROPPED
- MySQL-based response storage (replaced by MongoDB)
- Report PDF generation
- Admin panel from final product scope
- Email OTP verification for registration
- Logo upload feature in profile

---

Format as a well-structured markdown file with clear headings. Use tables where they help (especially for API route listings). Use code blocks for all JSON examples, SQL, and aggregation pipelines. This file will be used to write 12 weekly progress reports and a final B.Tech project report for SVVV Indore.
```

---

## PROMPT 3 — For Frontend Antigravity

Give this prompt to the Antigravity session with your `frontend/` folder open.

---

```
You are a technical documentation expert. I need you to generate an exhaustive, highly detailed markdown documentation file for the frontend component of InsightLoop — an AI-Powered Feedback Intelligence Platform built as a B.Tech minor project.

The audience for this document is:
1. Me (developer) — to write weekly progress reports and a final project report for college
2. My teammates — to understand what was built
3. College evaluators — who need to see proper software engineering process

Generate a single long markdown file with ALL of the following sections. Be extremely detailed.

---

SECTION 1: COMPONENT OVERVIEW
- What the frontend is and who uses it
- Two types of users: business owners (dashboard) and customers (public feedback form)
- Where it is deployed: Vercel
- Technology: pure HTML5, CSS3, vanilla JavaScript — no framework
- Why vanilla JS was chosen: faster development for college project scope, all team members understand it, Bootstrap handles layout, GSAP handles animation

SECTION 2: TECHNOLOGY STACK
Every external library used, loaded via CDN:
- Bootstrap 5.3 — grid, layout, responsive utilities
- Bootstrap Icons 1.11 — icon set used throughout
- Google Fonts (Inter) — typography
- GSAP 3.12 + ScrollTrigger — scroll animations on landing page
- Chart.js 4.4 — dashboard and analysis charts (line, bar, donut, horizontal bar)
- QRCode.js — client-side QR code generation from public_url string
- Any other CDN libraries used

SECTION 3: FOLDER AND FILE STRUCTURE
Show complete tree with one-line description of every file:

frontend/
├── index.html          — Public landing page showcasing InsightLoop features
├── feedback.html       — PUBLIC: Customer feedback form (opened via QR scan, no login)
├── assets/
│   ├── fonts/
│   └── images/
│       └── logo.png
├── components/
│   ├── navbar.html     — Shared navbar HTML (loaded into dashboard pages)
│   └── sidebar.html    — Shared sidebar HTML (loaded into dashboard pages)
├── css/
│   ├── main.css        — Design tokens (CSS variables), shared components, all reusable styles
│   ├── landing.css     — Landing page specific styles
│   ├── auth.css        — Login and register page styles
│   ├── dashboard.css   — Dashboard page styles, sidebar layout, chart containers
│   ├── forms.css       — Forms page, create form modal styles
│   ├── chat.css        — Chat page two-panel layout, message bubbles, SSE streaming UI
│   └── (any other css files that exist)
├── js/
│   ├── config.js       — API_BASE URL, Auth object (getToken/setToken/etc), apiFetch wrapper, showToast, formatDate, formatTime, setActiveSidebarItem
│   ├── landing.js      — GSAP animations for landing page
│   ├── auth.js         — Login and register form logic
│   ├── dashboard.js    — Dashboard stats, charts, recent responses, alerts
│   ├── forms.js        — Forms list, create form modal with limit enforcement, QR modal
│   ├── feedback.js     — Public feedback form: load schema, render questions, submit, thank you screen
│   ├── chat.js         — Thread management, SSE streaming, message rendering, RAG citations
│   ├── settings.js     — Profile update and password change
│   └── (any other js files that exist)
└── pages/
    ├── login.html
    ├── register.html
    ├── dashboard.html
    ├── forms.html
    ├── responses.html   — View all responses for a form (if built)
    ├── analysis.html    — Per-form analytics charts (if built)
    ├── settings.html
    └── chat.html

SECTION 4: DESIGN SYSTEM (from main.css)
Document the complete design language:

4.1 Color palette — every CSS variable:
- Background layers: --bg-base, --bg-elevated, --bg-card, --bg-hover
- Borders: --border-subtle, --border-muted
- Accent: --accent (#6366f1), --accent-hover, --accent-light, --accent-glow, --accent-grad
- Sentiment colors: --positive (#10b981), --neutral (#f59e0b), --negative (#ef4444), and their background variants
- Text: --text-primary, --text-secondary, --text-muted

4.2 Typography:
- Font family: Inter (Google Fonts)
- Size scale used throughout (stat numbers: 40px/700, section titles: 20px/600, body: 14px/400, labels: 12px/500 uppercase)

4.3 Component classes:
- .il-card — card container with border, border-radius: 12px, hover effect
- .il-input — styled input with focus ring using --accent-glow
- .il-label, .il-form-group
- .btn-primary-il — gradient accent button
- .btn-secondary-il — ghost button
- .badge-sentiment.positive/neutral/negative — colored dot + text
- .badge-urgency.high/medium/low
- .skeleton — shimmer loading animation
- .il-overlay, .il-modal — modal backdrop and container
- .section-label — uppercase 11px spaced label

4.4 Sidebar layout dimensions:
- --sidebar-width: 240px
- --navbar-height: 60px
- How main content area is offset using these variables

SECTION 5: config.js — THE SHARED UTILITY MODULE
Document every function and object in config.js:

5.1 API_BASE constant — how it points to the Render backend URL

5.2 Auth object:
- getToken() — reads from localStorage
- setToken(token) — writes to localStorage
- getBusiness() — reads JSON-parsed business object
- setBusiness(business) — writes JSON-stringified
- clear() — removes both keys on logout
- isLoggedIn() — returns boolean
- requireAuth() — redirects to login.html if not logged in (called at top of every dashboard page)
- redirectIfLoggedIn() — redirects to dashboard.html if already logged in (called on login/register pages)

5.3 apiFetch(path, options) — the centralized fetch wrapper:
- Automatically adds Authorization: Bearer header from localStorage
- Sets Content-Type: application/json
- Parses response JSON
- Throws Error with data.error message if response not ok
- Used on every API call throughout the app

5.4 showToast(message, type) — lightweight toast notification:
- Fixed position, bottom-right
- Color-coded by type: success (green), error (red), info (accent), warning (amber)
- Auto-dismisses after 3.5 seconds
- CSS animation: slideInToast

5.5 formatDate(isoString) and formatTime(isoString) — localized date formatting for en-IN locale

5.6 setActiveSidebarItem() — reads current page filename, adds active class to matching sidebar link

SECTION 6: EVERY PAGE — COMPLETE DOCUMENTATION
For each HTML page document:
- Purpose and who accesses it
- URL and how user gets there
- Auth check (requireAuth or redirectIfLoggedIn or public)
- Complete layout description (sections, columns, components)
- Every API call made (what endpoint, when, what data is used)
- All interactive elements and what JS handles them
- Empty states and loading states
- Responsive behavior

Pages to document:

6.1 index.html — Landing Page
- Sections: sticky navbar, hero section with GSAP animated text, problem statement, how it works (3 steps), features grid (6 cards), who it's for (business type chips), footer
- GSAP animations: hero text stagger on load, cards scroll-triggered fade-in with ScrollTrigger
- No API calls — fully static
- CTA buttons linking to login and register pages

6.2 feedback.html — Customer Feedback Form (Public)
- URL: feedback.html?form_id=uuid (QR code encodes this URL)
- Reads form_id from URLSearchParams
- API: GET /api/feedback/form/:form_id → renders form dynamically
- Three question types rendered differently:
  - rating: 5 clickable star icons (bi-star → bi-star-fill on click, value stored in JS)
  - text: textarea element
  - yesno: two large styled buttons (Yes / No), one toggles active on click
- Validation: checks required questions before submit
- Submit: POST /api/responses/submit with enriched answers object
- Thank you screen: replaces form content with animated checkmark + message
- Error states: invalid form_id, inactive form, API failure

6.3 pages/login.html
- Two-column layout (branding left, form right)
- Email + password inputs with show/hide toggle on password
- POST /api/auth/login → stores token and business in localStorage → redirects to dashboard.html
- Error message shown inline if credentials wrong

6.4 pages/register.html
- Same two-column layout
- Fields: first name, last name (joined as name), email, industry dropdown, phone (optional), password, confirm password
- Password strength indicator (4 bars — checks length, uppercase, number, special char)
- POST /api/auth/register → on success redirects to login.html with success toast

6.5 pages/dashboard.html
- First page after login — overview of all activity
- Loads in parallel: Promise.all([dashboard stats, sentiment trend, forms performance, recent responses, alerts])
- Stat cards (6): total responses, responses this week, responses today, active forms, complaints this month, positive rate (with delta arrow vs previous 30d), unread alerts (red badge)
- GSAP counter animation on stat numbers: animates from 0 to actual value
- Sentiment trend line chart (Chart.js): 3 lines (positive/neutral/negative), date range tabs (7d/30d/90d)
- Forms performance table: per-form stats with link to analysis page
- Recent responses table (last 15): click row to view response
- Alerts panel (hidden if no unread): type, message, time, mark as read button
- Unread alert count shown in navbar bell icon

6.6 pages/forms.html
- Lists all forms in a card grid (3 col desktop, 2 tablet, 1 mobile)
- Each card: title, description, response count, created date, active toggle, View QR, View Analytics, Delete buttons
- "Create New Form" button → opens create form modal
- Create form modal:
  - Two sections: basic info (title, description) + questions builder
  - Live limit counter: "2/5 rating · 1/3 text · 0/1 yes/no"
  - Add question: select type → enter label → is_required toggle → Add button
  - Questions list with delete and reorder (up/down arrows)
  - Type buttons grey out when limit reached with tooltip
  - Submit: POST /api/forms
- QR modal: generates QR image client-side using QRCode.js from public_url, Download button (canvas.toDataURL), Copy Link button (navigator.clipboard)
- Delete: confirm dialog → DELETE /api/forms/:form_id

6.7 pages/responses.html (if built — document whatever exists)
- Form selector dropdown at top
- Filter bar: sentiment buttons, urgency buttons, complaints toggle, date range inputs, search input
- Response tiles: horizontal card with sentiment badge, urgency badge, summary preview, topic, date
- Pending responses shown with ⏳ Analyzing indicator
- Click tile → modal showing: full AI summary, topic, key phrases as chips, then each raw answer rendered by type (stars for rating, text for text, Yes/No for yesno), per-text AI analysis inline under text answers
- All filtering done client-side on already-fetched array

6.8 pages/analysis.html (if built — document whatever exists)
- Form selector + trend period tabs (7d/30d/90d)
- Stat row (5 cards): total, positive%, negative%, complaints, high urgency
- Sentiment donut (Chart.js doughnut, cutout 65%)
- Urgency bar chart (3 bars: low/medium/high, colors: green/amber/red)
- Sentiment trend line chart (same as dashboard but scoped to this form)
- Top topics horizontal bar chart (indexAxis: 'y')
- Rating distribution: one bar chart per rating question, dynamically generated from rating_distribution response

6.9 pages/settings.html
- Two cards: Business Profile (left) and Change Password (right)
- Profile: loads GET /api/auth/me on page load, prefills name/email(disabled)/industry/phone
- Save: PUT /api/auth/profile → updates localStorage business object
- Password: current + new + confirm, validates match and length before PUT /api/auth/change-password

6.10 pages/chat.html
- Two-panel layout: chat sidebar (260px) + chat main area
- Chat sidebar: form selector dropdown at top, thread list below (one item per form that has a thread)
- Thread list items: form title + last message preview
- Chat main header: form name + message count
- Messages area: scrollable, user messages right-aligned (accent background), AI messages left-aligned (card background)
- Suggested prompts grid: shown when thread is empty (4 example questions as clickable chips)
- SSE streaming implementation:
  - fetch() with ReadableStream
  - Reader loop decoding chunks
  - Handles token events: appends to message text content in real-time
  - Handles done event: renders source citation chips below AI message (Phase 2 RAG)
  - Handles error event: shows error in red in the bubble
  - Typing indicator (3 animated dots) shown from send until first token arrives
- Input: auto-resize textarea, character counter (0/1000), Enter to send / Shift+Enter for new line
- Source citation chips: small clickable chips showing date and truncated snippet from actual feedback response

SECTION 7: THE SSE STREAMING IMPLEMENTATION
Document the client-side streaming code in detail:

7.1 Why fetch() instead of EventSource:
- EventSource only supports GET requests — cannot send a request body
- fetch() with ReadableStream supports POST with body
- Full code walkthrough

7.2 The reading loop:
- getReader() on response.body
- TextDecoder with { stream: true }
- Splitting on newlines, filtering for "data: " prefix
- Parsing JSON from each line
- Handling partial chunks that may split across reads

7.3 Event type handling:
- token: build up fullText, set textContent on active bubble (real-time)
- done: render sources array as citation chips
- chart: create Chart.js canvas inline in bubble (Phase 3 — planned)
- error: display error message in bubble

7.4 Creating the assistant bubble before streaming starts:
- Typing indicator shown immediately
- First token clears typing indicator and starts text
- Bubble element reference kept for appending tokens

SECTION 8: RESPONSIVE DESIGN
- Sidebar collapses on mobile: hamburger toggle button in navbar
- Grid layouts use Bootstrap breakpoints
- Forms card grid: col-lg-4, col-md-6, col-12
- Chat sidebar becomes full-width column at top on mobile
- Filter bar wraps on small screens
- All charts are responsive: true in Chart.js options

SECTION 9: PROBLEMS FACED AND HOW THEY WERE SOLVED
Document every real problem:

Problem 1: Page reload losing authentication state
- JWT stored in localStorage — survives reload
- requireAuth() called at top of every dashboard page to redirect if missing

Problem 2: Sidebar and navbar in components/ — how they're loaded
- Are they HTML includes loaded via fetch()? Or duplicated in each page?
- Document the exact approach used and any issues with it

Problem 3: Chart.js charts not destroying before re-render
- When switching forms in analysis page, old chart instance remained
- Fixed by storing chart instance in window variable and calling .destroy() before creating new one

Problem 4: SSE chunks arriving split across ReadableStream reads
- A single SSE event line may arrive split across two chunks
- Fixed with TextDecoder stream: true and accumulation buffer

Problem 5: QR code generated in wrong format
- Original server-side PNG generation was removed in favor of client-side QRCode.js
- QRCode.js generates a canvas element which can be converted to PNG via canvas.toDataURL()

Problem 6: CORS errors in development with different ports
- Frontend on localhost:5500 (Live Server), backend on localhost:5000
- Fixed by enabling CORS in Node backend for all origins in development

(Add any other real problems encountered)

SECTION 10: WHAT WAS DROPPED OR SIMPLIFIED
- Reports page: no UI built — reports feature dropped entirely
- Admin panel: no UI built — dropped from final product scope
- GSAP animations on dashboard pages: only landing page has heavy animation; dashboard uses CSS transitions only for performance
- Pagination: all responses loaded at once, filtered client-side — server-side pagination was not implemented
- Logo upload: settings page allows name/industry/phone only
- Phase 3 data visualization in chat: chart event type handling scaffolded in chat.js but never triggered since FastAPI doesn't send chart events yet

SECTION 11: DEPLOYMENT
- Platform: Vercel (free tier)
- How static files are served
- How API_BASE in config.js points to Render backend (production URL)
- Any Vercel configuration needed (vercel.json if used)

SECTION 12: PAGES SUMMARY TABLE
Create a table: Page | File | JS File | CSS File | Auth | APIs Called | Status (Done/Not Built)

---

Format as a well-structured markdown file. Use tables for API summaries and page listings. Use code blocks for JS examples. This file will be used to write 12 weekly progress reports and a B.Tech final project report for SVVV Indore, Department of AI and Data Science.
```

---

## How to Use These Three Files

Once Antigravity generates all three markdown files, you will have:
- `ai_service_docs.md`
- `node_backend_docs.md`
- `frontend_docs.md`

Bring all three back to me along with the weekly report format (already uploaded — the .doc file). I will then generate all 12 weekly reports by mapping your project's actual timeline to the format's phases, using the content from these three files.

The weekly report format from your college has these 12 weeks:

| Week | Dates | Focus |
|---|---|---|
| Week 1 | Jan 19–24 | Project initiation, problem statement, product backlog |
| Week 2 | Jan 26–31 | Use case diagrams and functional modeling |
| Week 3 | Feb 2–7 | Static analysis, class diagrams, object diagrams |
| Week 4 | Feb 9–14 | Dynamic analysis, activity diagrams |
| Week 5 | Feb 16–21 | Interaction modeling, sequence diagrams |
| Week 6 | Feb 23–28 | Detailed class design, package diagrams |
| Week 7 | Mar 2–7 | System architecture, component and deployment diagrams |
| Week 8 | Mar 23–28 | Sprint 1 — core feature implementation |
| Week 9 | Mar 30–Apr 4 | CI/CD pipeline setup |
| Week 10 | Apr 6–11 | Sprint 2 — UI and database integration |
| Week 11 | Apr 13–18 | Testing phase |
| Week 12 | Apr 20–25 | Deployment and final review |

Each weekly report follows this structure:
1. Executive Summary (sprint number, goal, status: green/yellow/red)
2. UML & OOAD Progress (diagrams completed, revised, OO concepts applied)
3. Technical Execution (Git activity, CI/CD status)
4. Testing Summary
5. Goals for Next Week

The three markdown files will give me enough content to fill every section for all 12 weeks accurately.