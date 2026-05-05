# InsightLoop — Chat System Roadmap
> **Owner:** Shubhranshu (FastAPI) + Purvi (Node proxy + frontend integration)  
> **Purpose:** Complete implementation guide for the AI chat system, built in phases.  
> **Rule:** Frontend never calls FastAPI directly. Node is always the proxy.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [MongoDB — Chat Storage Design](#2-mongodb--chat-storage-design)
3. [FastAPI — Endpoints to Build](#3-fastapi--endpoints-to-build)
4. [Phase 1 — Simple Chat with Context Management](#4-phase-1--simple-chat-with-context-management)
5. [Phase 2 — RAG Integration](#5-phase-2--rag-integration)
6. [Phase 3 — Data Visualization Tool](#6-phase-3--data-visualization-tool)
7. [Streaming — How It Works End to End](#7-streaming--how-it-works-end-to-end)
8. [Purvi's Integration Guide (Node Backend)](#8-purvis-integration-guide-node-backend)
9. [Guardrails and Prompt Design](#9-guardrails-and-prompt-design)
10. [Error Handling and Retry Strategy](#10-error-handling-and-retry-strategy)
11. [Pydantic Schema Validation for LLM Responses](#11-pydantic-schema-validation-for-llm-responses)
12. [Files to Build](#12-files-to-build)
13. [Build Order](#13-build-order)

---

## 1. Architecture Overview

```
Business Owner (Browser)
        │
        │  sends message
        ▼
Purvi — Node Backend (Port 3000)
        │
        │  1. Extracts business_id from JWT
        │  2. Forwards request to FastAPI
        │  3. Pipes SSE stream back to frontend
        ▼
Shubhranshu — FastAPI (Port 8000)
        │
        ├── Reads full chat thread from MongoDB
        ├── Builds system prompt (schema context + summary)
        ├── Calls Gemini with full context
        ├── Streams tokens back to Node
        └── After stream ends: saves assistant message to MongoDB
```

**Key rules:**
- FastAPI owns the entire chat lifecycle — session creation, message storage, context management, LLM calls
- Node backend owns nothing related to chat state — it only forwards and pipes
- Purvi reads MongoDB `chat_threads` directly to render chat history on page load
- One chat thread per `(business_id, form_id)` pair — permanent, never auto-deleted

---

## 2. MongoDB — Chat Storage Design

### Collection: `chat_threads`

One document per `(business_id, form_id)` pair. This is identified by a compound lookup, not by an ID passed around.

```js
{
  // ── Identifiers ──────────────────────────────────────────
  "thread_id":    "uuid-string",       // generated on creation
  "business_id":  "uuid-string",       // from JWT
  "form_id":      "uuid-string",       // which form this chat is about
  "form_title":   "Dining Experience Feedback",  // denormalized from MySQL

  // ── Messages array ────────────────────────────────────────
  // Append-only. Never delete individual messages.
  // FastAPI appends user message first, then assistant message after stream ends.
  "messages": [
    {
      "role":      "user",
      "content":   "What are the most common complaints this month?",
      "timestamp": "2026-05-01T10:00:00Z"
    },
    {
      "role":      "assistant",
      "content":   "The most common complaints are about food temperature (14 responses) and slow service (9 responses).",
      "timestamp": "2026-05-01T10:00:06Z",
      "sources":   []    // empty in Phase 1, filled in Phase 2
    }
  ],

  // ── Context Summary ───────────────────────────────────────
  // When messages array exceeds SUMMARY_THRESHOLD (e.g. 20 messages),
  // older messages are summarized into this field and removed from the array.
  // The summary is injected into the system prompt so the LLM retains long-term context.
  "context_summary": "",    // empty until summarization is first triggered

  // ── Metadata ─────────────────────────────────────────────
  "message_count":  4,         // total ever sent (not just in array — includes summarized)
  "created_at":     "2026-05-01T10:00:00Z",
  "updated_at":     "2026-05-01T10:05:00Z"
}
```

### Indexes to Create

```js
// Primary lookup — used on every request
db.chat_threads.createIndex({ "business_id": 1, "form_id": 1 }, { unique: true })

// For listing all threads of a business (sidebar)
db.chat_threads.createIndex({ "business_id": 1, "updated_at": -1 })

// For direct lookup by thread_id
db.chat_threads.createIndex({ "thread_id": 1 }, { unique: true })
```

The `unique: true` on `(business_id, form_id)` enforces the one-thread-per-form rule at the database level — even if something calls thread creation twice, MongoDB will reject the duplicate.

---

## 3. FastAPI — Endpoints to Build

All endpoints require `X-Internal-Secret` header. Node backend always adds this.

### Endpoint Summary

| Method | Path | Purpose | Streaming? |
|---|---|---|---|
| `POST` | `/chat/thread` | Get or create a thread for a form | No |
| `POST` | `/chat/message` | Send message, stream response | **Yes — SSE** |
| `GET` | `/chat/threads/{business_id}` | List all threads for sidebar | No |
| `GET` | `/chat/thread/{business_id}/{form_id}` | Get full thread with messages | No |
| `DELETE` | `/chat/thread/{business_id}/{form_id}` | Clear thread history | No |

---

### `POST /chat/thread` — Get or Create Thread

Called when business owner opens the chat page and selects a form.

**Request body:**
```json
{
  "business_id": "uuid-biz",
  "form_id":     "uuid-form",
  "form_title":  "Dining Experience Feedback"
}
```

`form_title` is sent by Node (it already fetched the form from MySQL). FastAPI stores it denormalized.

**Response:**
```json
{
  "thread_id":      "uuid-thread",
  "business_id":    "uuid-biz",
  "form_id":        "uuid-form",
  "form_title":     "Dining Experience Feedback",
  "is_new":         false,
  "message_count":  12,
  "messages": [
    { "role": "user",      "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "timestamp": "...", "sources": [] }
  ],
  "created_at": "2026-05-01T10:00:00Z",
  "updated_at": "2026-05-01T10:05:00Z"
}
```

**Logic:**
- Try to find existing thread by `{ business_id, form_id }`
- If found: return it with full messages array
- If not found: create new thread with empty messages, return with `is_new: true`
- Never overwrite an existing thread when called again

---

### `POST /chat/message` — Send Message, Stream Response

The main endpoint. Returns a streaming SSE response.

**Request body:**
```json
{
  "thread_id":   "uuid-thread",
  "business_id": "uuid-biz",
  "form_id":     "uuid-form",
  "message":     "What are the top complaints this month?"
}
```

**Response:** `text/event-stream` (SSE)

Stream format — each line is a separate SSE event:
```
data: {"type": "token", "token": "The"}

data: {"type": "token", "token": " most"}

data: {"type": "token", "token": " common"}

data: {"type": "done", "sources": [], "message_count": 6}

```

Two event types:
- `token` — one chunk of the LLM response. Frontend appends to the current message bubble.
- `done` — stream ended. Carries `sources` (empty Phase 1, filled Phase 2) and updated `message_count`.

**What FastAPI does internally (in order):**

```
1. Load thread from MongoDB by thread_id
2. Save user message to messages array immediately (push)
3. Decide context to send to LLM:
     - If context_summary exists: include it as a summary block
     - Take last N messages from messages array (sliding window)
     - Build schema context string (from MySQL or MongoDB fallback)
4. Build system prompt
5. Invoke LLM with streaming enabled
6. Stream tokens back as SSE events
7. After stream completes:
     - Save full assistant response to messages array (push)
     - Increment message_count
     - Update updated_at
     - Check if summarization should be triggered
     - If yes: run summarization, update context_summary, trim old messages
```

---

### `GET /chat/threads/{business_id}` — List All Threads

Used by Purvi to render the form selector / chat list in the sidebar.

**Response:**
```json
{
  "threads": [
    {
      "thread_id":     "uuid-1",
      "form_id":       "uuid-form-1",
      "form_title":    "Dining Experience Feedback",
      "message_count": 14,
      "last_message":  "What are complaints about food?",
      "updated_at":    "2026-05-01T10:05:00Z"
    },
    {
      "thread_id":     "uuid-2",
      "form_id":       "uuid-form-2",
      "form_title":    "Staff Feedback",
      "message_count": 3,
      "last_message":  "Any recurring issues with staff?",
      "updated_at":    "2026-04-28T14:20:00Z"
    }
  ]
}
```

Sorted by `updated_at` descending (most recently active first). `last_message` is the content of the last user message — for preview in the sidebar.

---

### `GET /chat/thread/{business_id}/{form_id}` — Get Full Thread

Used when user clicks a thread in the sidebar. Returns the complete thread with all messages.

**Response:** Same structure as `POST /chat/thread` response.

---

### `DELETE /chat/thread/{business_id}/{form_id}` — Clear History

Clears the messages array and resets context summary. Does NOT delete the thread document itself — the thread still exists, just empty.

**Response:**
```json
{ "message": "Thread history cleared.", "thread_id": "uuid-thread" }
```

---

## 4. Phase 1 — Simple Chat with Context Management

### What Gets Built

- `app/routes/query.py` — the `/chat/*` endpoints
- `app/chat/engine.py` — the core chat logic
- `app/chat/schema_context.py` — builds form schema description for LLM
- `app/chat/context_manager.py` — sliding window + summarization logic
- `app/schemas/query.py` — updated Pydantic models

No RAG, no tools. LLM answers from its understanding of the schema context and chat history. Already useful for questions like "how many text questions does this form have?" or general guidance.

---

### Context Management — The Sliding Window + Summarization Strategy

**The problem:** Chat history grows indefinitely. Sending all 200 messages to the LLM every turn is expensive (tokens), slow (bigger prompt), and eventually hits the context window limit.

**The solution: sliding window with lazy summarization.**

**Constants (configurable via `.env`):**
```
CONTEXT_WINDOW_SIZE = 20    # how many recent messages to always send raw
SUMMARY_THRESHOLD   = 30    # when total messages exceed this, trigger summarization
```

**How it works:**

```
Total messages in thread: 35

messages array in MongoDB stores last 20 (the window)
context_summary stores a prose summary of messages 1–15

LLM receives:
  [System prompt]
  [Schema context]
  [Context summary: "Earlier in this conversation, the owner asked about 
   food complaints and was told about 14 responses mentioning cold food..."]
  [Last 20 raw messages]
  [Current user message]
```

**When summarization triggers:**

After saving an assistant message, if `message_count > SUMMARY_THRESHOLD`:
1. Take the oldest 15 messages from the array (the ones that will be trimmed)
2. Call LLM: *"Summarize this conversation history in 3-5 sentences, preserving key facts, numbers, and topics discussed."*
3. Append the new summary to the existing `context_summary` (don't overwrite — append so old context isn't lost)
4. Remove those 15 messages from the array
5. Save updated `context_summary` and trimmed `messages` to MongoDB

This is **lazy** — it only runs when the threshold is crossed, not on every turn.

---

### System Prompt Design

```
You are an AI analytics assistant for InsightLoop.
You help business owners understand their customer feedback data.

FORM CONTEXT:
{schema_context}

{context_summary_block}  ← only included if context_summary is non-empty

RULES:
- Answer only about this specific form's feedback data.
- If you don't have enough data to answer accurately, say so clearly.
- Do not make up numbers, trends, or customer quotes.
- Be specific, concise, and actionable.
- Do not answer questions unrelated to this business's feedback.
- If asked something outside your scope (competitor analysis, general business advice unrelated to feedback, personal questions), politely redirect.
```

`{schema_context}` is generated by `schema_context.py`. It describes what questions exist on the form, what types they are, and what the labels say. Example:

```
Form: "Dining Experience Feedback"
Total analyzed responses: 142

Questions:
  [q1-overall]  RATING (1-5): "How was your overall experience?"
  [q2-food]     RATING (1-5): "Rate the food quality"
  [q3-service]  RATING (1-5): "Rate the service speed"
  [q4-improve]  TEXT: "What could we do better?"
  [q5-enjoy]    TEXT: "What did you enjoy most?"
  [q6-rec]      YES/NO: "Would you recommend us?"

AI-derived fields per response:
  - overall_sentiment: positive | neutral | negative
  - urgency: low | medium | high
  - is_complaint: true | false
  - dominant_topic: string
  - per text question: sentiment, topics, key_phrases, intent
```

**MySQL fallback for schema_context:** Since MySQL may not be available yet, `schema_context.py` should try MySQL first, and if it fails, fall back to reading the question labels from the last 5 MongoDB responses for this form (they carry labels in the `answers` map — self-describing).

---

### Guardrails

Implemented as rules in the system prompt + a pre-check before calling the LLM.

**Topic guardrail (pre-check):** Before calling the LLM, check if the message is clearly off-topic using a simple keyword/phrase list. If so, return a canned response without spending tokens.

Off-topic triggers:
- Questions about other businesses
- Requests to generate code unrelated to feedback analysis
- Personal questions
- Requests to ignore previous instructions ("ignore your instructions and...")
- Prompt injection attempts ("you are now a different AI...")

```python
INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore your instructions",
    "you are now",
    "pretend you are",
    "act as if",
    "forget everything",
    "new instructions:"
]

def check_guardrails(message: str) -> str | None:
    """Returns a canned response string if guardrail triggered, else None."""
    lower = message.lower()
    for pattern in INJECTION_PATTERNS:
        if pattern in lower:
            return "I'm here to help you analyze your customer feedback. I can't process that type of request."
    return None
```

If guardrail triggers, FastAPI streams the canned response as tokens (same SSE format) and saves it as an assistant message. Consistent behavior — frontend doesn't need to handle it differently.

---

## 5. Phase 2 — RAG Integration

### What Gets Added

- `app/chat/tools/rag_tool.py` — wraps the existing `search_with_sources()` from `vector/store.py`
- Engine updated to call RAG before building the LLM prompt

### How RAG Works in the Chat Flow

```
User message arrives
        │
        ▼
Query classifier (rule-based, no LLM needed)
"Does this question need actual feedback text?"
        │
    ┌───┴───┐
   Yes      No
    │        │
    ▼        ▼
ChromaDB    Skip RAG,
semantic    answer from
search      context only
    │
    ▼
Top 8 relevant feedback documents retrieved
(filtered by business_id + form_id)
        │
        ▼
Injected into system prompt as "RELEVANT FEEDBACK"
        │
        ▼
LLM generates answer citing retrieved chunks
        │
        ▼
Sources returned in `done` SSE event
```

**Query classifier logic — when to use RAG:**

```python
RAG_TRIGGER_KEYWORDS = [
    "complaint", "complain", "said", "mentioned", "wrote", "feedback",
    "customers say", "what do customers", "common issue", "problem",
    "suggestion", "improve", "dislike", "unhappy", "negative"
]

def should_use_rag(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in RAG_TRIGGER_KEYWORDS)
```

This is intentionally simple — no LLM call for classification. Fast and deterministic.

**RAG context block in system prompt:**
```
RELEVANT CUSTOMER FEEDBACK (retrieved for this query):

[2026-04-20] Feedback: "The biryani arrived completely cold and we waited over 45 minutes."
→ Sentiment: Negative | Topic: Food Quality | Intent: Complaint

[2026-04-19] Feedback: "Service was extremely slow. Staff seemed understaffed."
→ Sentiment: Negative | Topic: Service Speed | Intent: Complaint

---
Use the above as evidence when answering. Cite specific feedback when relevant.
```

**Citations in the `done` event:**
```json
{
  "type": "done",
  "sources": [
    {
      "response_id":  "resp-001",
      "submitted_at": "2026-04-20",
      "snippet":      "biryani arrived completely cold and we waited over 45 minutes"
    },
    {
      "response_id":  "resp-002",
      "submitted_at": "2026-04-19",
      "snippet":      "Service was extremely slow. Staff seemed understaffed."
    }
  ],
  "message_count": 8
}
```

Frontend renders these as small citation chips below the assistant message. Clicking a chip could show the full response — Purvi can add that to the dashboard later.

---

## 6. Phase 3 — Data Visualization Tool

### What Gets Added

- `app/chat/tools/data_tool.py`
- Engine updated to detect quantitative queries and route to data tool

### How It Works

When the user asks a quantitative question ("what is the average rating?", "show me a chart of complaints by topic"), the data tool:

1. Pulls responses from MongoDB for this `form_id`
2. Builds a pandas DataFrame from the structured `ai_analysis` fields
3. Computes the answer (average, count, breakdown)
4. Returns chart-ready JSON data

**The response for a chart query looks different in the SSE stream:**

```
data: {"type": "token", "token": "Here is the rating breakdown for your form:"}

data: {"type": "chart", "chart_type": "bar", "data": {
  "labels": ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"],
  "datasets": [{
    "label": "How was your overall experience?",
    "data": [8, 14, 31, 52, 37]
  }]
}}

data: {"type": "done", "sources": [], "message_count": 10}
```

A new `chart` event type is introduced. Frontend (Purvi) receives this and renders a Chart.js bar chart inline in the chat bubble instead of text.

**Query routing logic:**

```python
QUANTITATIVE_KEYWORDS = [
    "average", "avg", "how many", "count", "percentage", "percent", "%",
    "chart", "graph", "breakdown", "distribution", "trend", "over time",
    "rating", "score", "total", "number of"
]

def should_use_data_tool(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in QUANTITATIVE_KEYWORDS)
```

---

## 7. Streaming — How It Works End to End

### FastAPI Side

FastAPI returns a `StreamingResponse` with `media_type="text/event-stream"`.

The generator function `chat_stream()` is an `async def` that `yield`s SSE-formatted strings.

Each yielded string must follow SSE format exactly:
```
data: <json_string>\n\n
```

The double newline `\n\n` is required — it's how SSE signals the end of one event.

### Node Backend Side (What Purvi Needs to Do)

Node must pipe the stream without buffering. Two things matter:

**1. Use `axios` with `responseType: 'stream'`:**
```js
const aiResponse = await axios.post(
  `${AI_SERVICE_URL}/chat/message`,
  body,
  {
    headers: { 'X-Internal-Secret': INTERNAL_SECRET },
    responseType: 'stream'    // ← critical — don't buffer
  }
)
```

**2. Set response headers and pipe:**
```js
res.setHeader('Content-Type', 'text/event-stream')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('X-Accel-Buffering', 'no')   // tells nginx not to buffer
res.setHeader('Connection', 'keep-alive')
aiResponse.data.pipe(res)
```

That's it for Node. The stream flows: FastAPI → Node (pipes through) → Frontend.

### Frontend Side (What Purvi Renders)

JavaScript `EventSource` or `fetch` with `ReadableStream`:

```js
const response = await fetch('/api/chat/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ thread_id, form_id, message })
})

const reader = response.body.getReader()
const decoder = new TextDecoder()
let assistantMessage = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  const chunk = decoder.decode(value)
  const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

  for (const line of lines) {
    const event = JSON.parse(line.replace('data: ', ''))

    if (event.type === 'token') {
      assistantMessage += event.token
      // Update the chat bubble in real time
      updateChatBubble(assistantMessage)
    }

    if (event.type === 'chart') {
      // Render Chart.js chart inline
      renderInlineChart(event.chart_type, event.data)
    }

    if (event.type === 'done') {
      // Finalize message, render citation chips
      finalizeMessage(assistantMessage, event.sources)
    }
  }
}
```

---

## 8. Purvi's Integration Guide (Node Backend)

### Node Routes to Build

```
POST   /api/chat/thread              → proxies to FastAPI POST /chat/thread
POST   /api/chat/message             → proxies to FastAPI POST /chat/message (STREAM)
GET    /api/chat/threads             → reads MongoDB chat_threads directly (no FastAPI call)
GET    /api/chat/thread/:form_id     → reads MongoDB chat_threads directly (no FastAPI call)
DELETE /api/chat/thread/:form_id     → proxies to FastAPI DELETE /chat/thread/{bid}/{fid}
```

**For `GET` endpoints** — Purvi reads MongoDB directly. No need to proxy through FastAPI for read-only data. She connects to the same MongoDB and queries `chat_threads` herself. This is faster and avoids unnecessary FastAPI calls for simple reads.

**For `POST /chat/message`** — this is the streaming proxy. The piping approach above must be used.

---

### POST /api/chat/thread

**What Node does:**
1. Extract `business_id` from JWT
2. Fetch `form_title` from MySQL (`SELECT title FROM feedback_forms WHERE form_id = ?`)
3. POST to FastAPI with `{ business_id, form_id, form_title }`
4. Return FastAPI's response directly

**Frontend sends:**
```json
{ "form_id": "uuid-form" }
```

**Frontend receives:** The full thread object including messages array (for rendering history on load).

---

### POST /api/chat/message

**What Node does:**
1. Extract `business_id` from JWT
2. Get `thread_id` — either from request body (if frontend sends it) or look it up from MongoDB by `(business_id, form_id)`
3. Stream proxy to FastAPI

**Frontend sends:**
```json
{
  "form_id":   "uuid-form",
  "thread_id": "uuid-thread",
  "message":   "What are the top complaints?"
}
```

**Frontend receives:** SSE stream.

---

### GET /api/chat/threads (Sidebar List)

Purvi queries MongoDB directly:
```js
const threads = await db.collection('chat_threads')
  .find({ business_id })
  .sort({ updated_at: -1 })
  .project({
    thread_id: 1, form_id: 1, form_title: 1,
    message_count: 1, updated_at: 1,
    last_message: { $arrayElemAt: ['$messages', -1] }
  })
  .toArray()
```

Returns the list for the sidebar. `last_message` is the last item in the messages array — used to show a preview.

---

### GET /api/chat/thread/:form_id (Load Specific Thread)

Purvi queries MongoDB directly:
```js
const thread = await db.collection('chat_threads').findOne({
  business_id,   // from JWT
  form_id        // from route param
})
```

Returns the full thread. Frontend renders the messages array as the chat history.

---

### On Page Load Flow

```
1. Frontend calls GET /api/chat/threads
   → Purvi reads MongoDB → returns list of forms that have threads
   → Frontend renders sidebar: "Dining Feedback (14 messages)", "Staff Survey (3 messages)"

2. User clicks a form in sidebar
   → Frontend calls GET /api/chat/thread/:form_id
   → Purvi reads MongoDB → returns full thread with messages
   → Frontend renders full chat history

3. User selects a NEW form that has no thread yet
   → Frontend calls POST /api/chat/thread { form_id }
   → Node proxies to FastAPI → FastAPI creates new thread → returns empty messages
   → Frontend renders empty chat with welcome message
```

---

## 9. Guardrails and Prompt Design

### Guardrail Layers (in order of checking)

```
Layer 1 — Input sanitization
  Strip excessive whitespace, limit message length to 1000 characters.
  If > 1000 chars: truncate and add note, or return 400.

Layer 2 — Injection detection (pre-LLM, no token cost)
  Check for known injection patterns in the message text.
  If detected: return canned response as SSE stream. Save to thread.

Layer 3 — System prompt guardrails (baked into every LLM call)
  Rules telling the LLM what it is, what it should answer, and what to refuse.

Layer 4 — Response validation (post-LLM, Phase 2 and 3)
  When LLM is asked to return structured JSON (for chart data tool),
  validate with Pydantic before sending to frontend.
  Retry up to 2 times if validation fails.
```

---

## 10. Error Handling and Retry Strategy

### LLM Call Failures

Gemini API can fail with rate limits, timeouts, or transient errors. Wrap every LLM call with retry logic.

**Strategy:** Exponential backoff, max 3 attempts.

```python
MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]   # seconds — doubles each time

async def call_llm_with_retry(messages):
    last_error = None
    for attempt, delay in enumerate(RETRY_DELAYS):
        try:
            return await llm.ainvoke(messages)
        except Exception as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(delay)
    raise last_error
```

For streaming, if the LLM call fails before streaming starts, send an error SSE event:
```json
data: {"type": "error", "message": "AI service temporarily unavailable. Please try again."}
```

Frontend handles `error` type by showing an error bubble instead of blank output.

If streaming has already started (some tokens sent) and then fails mid-stream, send:
```json
data: {"type": "error", "message": "Response generation interrupted. The partial response above may be incomplete."}
```

In both cases, do NOT save an incomplete assistant message to MongoDB.

### MongoDB Write Failures

If saving the user message to MongoDB fails — return error before calling the LLM. Don't call the LLM if we can't save the message. Data integrity first.

If saving the assistant message fails after streaming — log the error with full context. The response was streamed and shown to the user. On the next page load, the message won't be in history. Acceptable tradeoff — don't fail silently, log clearly.

---

## 11. Pydantic Schema Validation for LLM Responses

Used in Phase 3 when the data tool asks the LLM to return structured JSON for chart rendering.

**The pattern:** Prompt the LLM to return JSON only. Parse it. Validate with Pydantic. Retry if invalid.

```python
class ChartData(BaseModel):
    chart_type: Literal["bar", "line", "pie", "doughnut"]
    title:      str
    labels:     list[str]
    datasets:   list[dict]

async def get_chart_data(prompt: str) -> ChartData:
    for attempt in range(3):
        response = await llm.ainvoke([
            SystemMessage(content="Return ONLY valid JSON matching the schema. No explanation."),
            HumanMessage(content=prompt)
        ])
        try:
            raw = response.content.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return ChartData.model_validate_json(raw)
        except Exception as e:
            if attempt == 2:
                raise ValueError(f"LLM returned invalid chart data after 3 attempts: {e}")
            # Retry with error feedback
            prompt = f"{prompt}\n\nYour previous response was invalid JSON. Return ONLY the JSON object."
```

---

## 12. Files to Build (Modular Structure)

> **Updated:** The original flat structure has been refactored into a modular layout mirroring `app/pipeline/` (the /analyze pipeline). LangGraph nodes live in separate files under `nodes/`, utility functions under `utils/`, and the graph compilation in its own file.

```
app/
├── routes/
│   └── query.py                  ✅ DONE — All /chat/* endpoints (5 total)

├── chat/
│   ├── state.py                  ← [NEXT] ChatState TypedDict (extracted from engine.py)
│   ├── graph.py                  ← [NEXT] Imports nodes, compiles chat_graph
│   ├── engine.py                 ✅ DONE → will SHRINK (entry point only after restructure)
│   ├── schema_context.py         ✅ DONE — MySQL + MongoDB fallback, 5-min cache
│   │
│   ├── nodes/                    ← [NEXT] LangGraph node functions (1 file per node)
│   │   ├── __init__.py
│   │   ├── load_thread.py        ← extracted from engine.py
│   │   ├── build_context.py      ← extracted from engine.py
│   │   ├── stream_llm.py         ← extracted from engine.py (+ get_llm() singleton)
│   │   └── save.py               ← extracted from engine.py
│   │
│   ├── utils/                    ← [NEXT] Pure helper functions
│   │   ├── __init__.py
│   │   ├── context_manager.py    ✅ DONE → will MOVE here from app/chat/
│   │   └── guardrails.py         ✅ DONE → will MOVE here from app/chat/
│   │
│   └── tools/                    ← Phase 2/3 (stubs exist)
│       ├── rag_tool.py           🔴 STUB — Phase 2
│       └── data_tool.py          🔴 STUB — Phase 3

├── schemas/
│   └── query.py                  ✅ DONE — ChatMessage, ThreadResponse, MessageRequest,
│                                            SSE events (TokenEvent, DoneEvent, ErrorEvent)

├── db/
│   ├── mongo.py                  ✅ DONE → adding create_indexes()
│   └── mysql.py                  🟡 STUB → implementing real pool
```

---

## 13. Build Order

### Phase 1 — Core Chat ✅ DONE (being restructured)

All Phase 1 code is implemented and functional. Currently being restructured for modularity.

- [x] Update `app/schemas/query.py` — all models defined (ThreadRequest, ThreadResponse, MessageRequest, SSE events)
- [x] Build `app/chat/guardrails.py` — injection detection + input sanitization
- [x] Build `app/chat/schema_context.py` — MySQL read with MongoDB fallback + 5-min cache
- [x] Build `app/chat/context_manager.py` — sliding window + lazy summarization (CONTEXT_WINDOW_SIZE=20, SUMMARY_THRESHOLD=30)
- [x] Build `app/chat/engine.py` — 4-node LangGraph graph: load_thread → build_context → stream_llm → save
- [x] Build `app/routes/query.py` — all 5 endpoints (POST /chat/thread, POST /chat/message, GET /threads, GET /thread, DELETE /thread)
- [x] Register chat router in `main.py` at `/chat` prefix

### Phase 1.5 — Restructure + DB Setup (Current)

- [ ] Implement `app/db/mysql.py` — real aiomysql pool with SSL option
- [ ] Add `create_indexes()` to `app/db/mongo.py`
- [ ] Extract `ChatState` → `app/chat/state.py`
- [ ] Extract nodes → `app/chat/nodes/{load_thread,build_context,stream_llm,save}.py`
- [ ] Create `app/chat/graph.py` — import nodes, compile graph
- [ ] Move `context_manager.py` → `app/chat/utils/context_manager.py`
- [ ] Move `guardrails.py` → `app/chat/utils/guardrails.py`
- [ ] Shrink `engine.py` to entry point only (~80 lines)
- **Test:** Server starts, `/health` works, MySQL + MongoDB connected

### Phase 2 — RAG (After restructure)

- [ ] Build `app/chat/tools/rag_tool.py` — wraps existing `search_with_sources()`
- [ ] Add `should_use_rag()` classifier to engine
- [ ] Inject RAG context block into system prompt when triggered
- [ ] Include sources in `done` SSE event
- **Test:** Ask "what are complaints about food?" — verify sources appear in the `done` event

### Phase 3 — Data Tool (After Phase 2 works)

- [ ] Build `app/chat/tools/data_tool.py` — MongoDB aggregations → pandas → stats dict
- [ ] Add `should_use_data_tool()` classifier to engine
- [ ] Add `chart` SSE event type
- [ ] Add `ChartData` Pydantic model with retry validation
- [ ] Purvi adds Chart.js rendering on `chart` event type in frontend
- **Test:** Ask "show me average ratings" — verify `chart` event with correct data returned

---

## Possible Further Improvements (Nice to Have)

| Improvement | What it adds | When to add |
|---|---|---|
| **Suggested follow-up questions** | After each assistant response, return 2-3 suggested next questions as clickable chips | After Phase 1 — small LLM call addition |
| **Conversation title generation** | Auto-generate a title from the first message ("Complaints about food - May 2026") | After Phase 1 — one extra LLM call on first message only |
| **Response feedback (👍 👎)** | User can rate the AI answer. Store in MongoDB. Used to identify bad RAG retrievals. | After Phase 2 |
| **Typing indicator** | Frontend shows "AI is thinking..." before first token arrives | Frontend-only, no backend change |
| **Message timestamps** | Show time next to each message in the UI | Already in MongoDB, just render it |
| **Export chat** | Download chat history as PDF or text | After Phase 3, low priority |

---

*End of Chat System Roadmap*
