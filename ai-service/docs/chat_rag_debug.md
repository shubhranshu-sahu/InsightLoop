# InsightLoop Chat RAG — Bug Tracker & Fix History

> **Purpose:** Complete record of every bug encountered while building the Phase 2
> RAG Chat system, the root cause of each, and the exact fix applied.
> Read this before touching `stream_llm.py`, `execute_tools.py`, `store.py`, or `context_manager.py`.

---

## Architecture Overview

```
User Message
    │
    ▼
engine.py  ──  run_chat_stream()
    │
    ├─► load_thread_node      → reads MongoDB thread doc
    ├─► build_context_node    → builds LangChain messages + schema context
    ├─► stream_node (Phase 1) → ainvoke() with tools bound → decides if RAG needed
    │        │
    │   [if tool_call in response]
    │        │
    ├─► execute_tools_node    → Qdrant vector search → ToolMessage
    ├─► stream_node (Phase 3) → sanitized history → astream() → final answer
    ├─► save_node             → persists messages + sources to MongoDB
    │
    ▼
SSE stream → Node backend → frontend
```

---

## Bug 1 — Qdrant Filter Validation Error

### Error
```text
2 validation errors for QueryRequest
filter.business_id  Extra inputs are not permitted
filter.form_id      Extra inputs are not permitted
```

### Why It Happened
`qdrant-client >= 1.10` dropped support for raw Python dictionaries as filters.
We were passing:
```python
filter={"business_id": "...", "form_id": "..."}  # WRONG for qdrant-client 1.10+
```

### The Fix
Replaced raw dict with proper `Filter` + `FieldCondition` + `MatchValue` objects from `qdrant_client.http.models` in `app/vector/store.py`:
```python
from qdrant_client.http import models as rest
search_filter = rest.Filter(
    must=[
        rest.FieldCondition(key="metadata.business_id", match=rest.MatchValue(value=business_id)),
        rest.FieldCondition(key="metadata.form_id",     match=rest.MatchValue(value=form_id)),
    ]
)
```

---

## Bug 2 — Gemini `thought_signature` 400 Error

### Error
```text
Invalid argument provided to Gemini: 400
Function call is missing a thought_signature in functionCall parts.
Additional data: function call `default_api:search_feedback`, position 22.
```

### Why It Happened
When Gemini (model `gemini-3.1-flash-lite`) makes a tool call, it attaches a
`thought_signature` blob to the `AIMessage.additional_kwargs`. This signature must
be present in the conversation history when the `ToolMessage` result is sent back.

The problem: we were using `llm.astream()` for Phase 1 (tool decision). LangChain's
`AIMessageChunk.__add__()` operator, used to aggregate streaming chunks into a final
message, **silently drops `additional_kwargs`** (including `thought_signature`) during
aggregation. The aggregated message stored in `lc_messages` was corrupted.

On the next graph loop, when Gemini received this corrupted history, it crashed.

### What We Tried First (Broken)
Attempting to intercept and re-attach the `thought_signature` after streaming — too
fragile, didn't work reliably.

### The Fix
**Phase 1 uses `ainvoke()` instead of `astream()`.**

`ainvoke()` returns the native `AIMessage` directly from the Gemini API without any
chunk aggregation, preserving `thought_signature` intact in `additional_kwargs`.

**Trade-off:** Phase 1 responses (when no tool is needed) don't stream token-by-token.
**Mitigation:** `engine.py` has a fallback — when `streaming_started` is `False` at
graph completion, it emits the entire `full_response` as a single `TokenEvent`.

```python
# stream_llm.py — Phase 1
llm_with_tools = llm.bind_tools([search_feedback])
final_message = await llm_with_tools.ainvoke(state["lc_messages"])  # NOT astream()
```

```python
# engine.py — fallback for direct answers
if not streaming_started:
    full_resp = output.get("full_response", "")
    if full_resp:
        yield f"data: {TokenEvent(token=full_resp).model_dump_json()}\n\n"
```

---

## Bug 3 — History Sanitization for Phase 3

### The Problem
Even after fixing Phase 1 with `ainvoke()`, Phase 3 still had the corrupted
`[AIMessage(tool_calls), ToolMessage]` sequence in `lc_messages`. Sending this
back to Gemini for the final answer still triggered the 400 error.

### The Fix
**History sanitization in Phase 3.**

Before calling `llm.astream()` for the final answer, `stream_node` scans
`lc_messages` and replaces every `[AIMessage(tool_calls), ToolMessage]` pair
with a single clean `HumanMessage` containing the tool results as injected context:

```python
# stream_llm.py — Phase 3
sanitized_history = []
i = 0
while i < len(state["lc_messages"]):
    msg = state["lc_messages"][i]
    if hasattr(msg, "tool_calls") and msg.tool_calls:
        if i + 1 < len(state["lc_messages"]) and isinstance(state["lc_messages"][i+1], ToolMessage):
            tool_msg = state["lc_messages"][i+1]
            sanitized_history.append(
                HumanMessage(content=f"[System: Executed database search. Results:]\n{tool_msg.content}")
            )
            i += 2
            continue
    sanitized_history.append(msg)
    i += 1

async for chunk in llm.astream(sanitized_history, config={"tags": ["final_output"]}):
    ...
```

Gemini never sees the corrupted tool call history — only the clean injected context.

---

## Bug 4 — RAG Always Returns "No Matching Feedback" (Silent)

### The Error (silent — no exception, just wrong answer)
```text
"Since the database search returned no matching feedback for 'bad behavior'
or 'staff misconduct'..."
```
The search was running but returning 0 results for every query.

### Why It Happened — The Critical Discovery
A diagnostic script (`scratch/diag_qdrant.py`) revealed the actual Qdrant payload
structure stored by LangChain's `QdrantVectorStore`:

```json
{
  "page_content": "Form: f47...\nSubmitted: 2026-05-17T...",
  "metadata": {
    "business_id": "72f0f038-...",
    "form_id": "f4729d83-...",
    "response_id": "19238196-..."
  }
}
```

**LangChain nests ALL metadata under a `"metadata"` sub-key in the Qdrant payload.**
The metadata fields do NOT exist at the top level of the payload.

Our filters and indexes were using the wrong key paths:
```python
# WRONG — field doesn't exist at top level
FieldCondition(key="business_id", ...)
FieldCondition(key="form_id", ...)

# Payload indexes also created on wrong paths
client.create_payload_index(..., field_name="business_id", ...)
```

Since `business_id` at the top level doesn't exist in any document, every filter
returned 0 results — even though 53 vectors were stored correctly.

### The Fix
Updated all filter key paths and index paths to use the nested `metadata.` prefix:

```python
# store.py — correct filter
FieldCondition(key="metadata.business_id", match=MatchValue(value=business_id))
FieldCondition(key="metadata.form_id",     match=MatchValue(value=form_id))

# store.py — correct index creation (on startup)
client.create_payload_index(..., field_name="metadata.business_id", ...)
client.create_payload_index(..., field_name="metadata.form_id", ...)
```

Also lowered `min_score` threshold from `0.5` → `0.3` to improve recall for
semantically-adjacent content (e.g. "staff behavior" matching "rudeness at counter").

**Note:** The existing 53 vectors were NOT corrupted — only the indexes and filter
paths were wrong. After re-creating the indexes on the correct key paths, all
existing data became searchable immediately. No re-embedding required.

---

## Bug 5 — Sources Not Saved to MongoDB

### The Bug
RAG citations (the list of Qdrant search results) were never persisted with the
assistant's message in MongoDB, even when the search was successful.

### Why It Happened
Two separate issues:

1. **`initial_state` missing `sources` key:** `engine.py` didn't initialize
   `"sources": []` in the initial graph state. LangGraph couldn't merge the
   `sources` written by `execute_tools_node` back into the graph output.

2. **`save.py` hardcoded empty list:** The `assistant_msg` dict had
   `"sources": []` hardcoded — it never read from `state["sources"]`.

### The Fix
```python
# engine.py — added to initial_state
"sources": [],   # Must be initialized so execute_tools_node can write to it

# save.py — now reads from state
"sources": state.get("sources", []),  # RAG citations from vector search
```

---

## Bug 6 — Source Schema Mismatch Causing Production 500 Error

### Error (on deployed Render.com service)
```text
pydantic_core._pydantic_core.ValidationError: 1 validation error for Source
snippet
  Field required [type=missing, ...]
```
```text
POST /chat/thread HTTP/1.1 → 500 Internal Server Error
```

### Why It Happened
The `Source` Pydantic model in `schemas/query.py` had `snippet` as a **required**
field (`Field(...)`). However, `execute_tools_node` was storing raw Qdrant metadata
dicts — which contain `response_id`, `form_id`, `business_id`, etc. — but no
`snippet` field.

When `_parse_messages()` in `query.py` tried to deserialize the stored sources via
`Source(**s)`, Pydantic crashed because `snippet` was missing.

This crashed `POST /chat/thread` entirely, making chat history load fail for all users.

### The Fix
Two changes:

**1. `schemas/query.py`** — Made `Source` robust and backward-compatible:
```python
class Source(BaseModel):
    model_config = {"extra": "ignore"}   # Drop unknown fields like _id, _collection_name

    response_id:       str  = Field(...)  # Only truly required field
    submitted_at:      str  = Field("",  ...)
    snippet:           str  = Field("",  ...)  # Now optional, defaults to ""
    overall_sentiment: str  = Field("",  ...)
    urgency:           str  = Field("",  ...)
    dominant_topic:    str  = Field("",  ...)
    is_complaint:      str  = Field("",  ...)
    form_id:           str  = Field("",  ...)
    business_id:       str  = Field("",  ...)
```

**2. `execute_tools.py`** — Now stores properly shaped source dicts including `snippet`:
```python
sources.append({
    "response_id":       doc.metadata.get("response_id", ""),
    "submitted_at":      doc.metadata.get("submitted_at", ""),
    "snippet":           doc.page_content[:200],  # first 200 chars as preview
    "overall_sentiment": doc.metadata.get("overall_sentiment", ""),
    "urgency":           doc.metadata.get("urgency", ""),
    "dominant_topic":    doc.metadata.get("dominant_topic", ""),
    "is_complaint":      doc.metadata.get("is_complaint", ""),
    "form_id":           doc.metadata.get("form_id", ""),
    "business_id":       doc.metadata.get("business_id", ""),
})
```

---

## Bug 7 — Messages Array Wiped from MongoDB

### The Bug
After a thread had ~30+ messages, the `messages` array in MongoDB became empty.
`message_count` still showed 40, but the array was `[]`. Frontend showed blank history.

### Why It Happened
`run_summarization()` in `context_manager.py` physically deleted old messages:
```python
trim_count = max(CONTEXT_WINDOW_SIZE // 2, 5)  # = 10
remaining_messages = messages[trim_count:]      # slices out oldest 10
# Then save_node does: $set: {messages: remaining_messages}
```

On the first summarization pass (at message 31): `messages` had ~20 items, trim
10, keep 10 — correct. On the **second** pass (at message 41): `messages` now only
had ~10 items (already trimmed once), `trim_count = 10`, so
`remaining_messages = messages[10:] = []` — **entire array wiped**.

Additionally, `messages` is the data source for `GET /chat/thread` (the chat history
load endpoint). Trimming `messages` broke the frontend's ability to show full history.

### The Fix
`run_summarization()` now **never physically trims the messages array**. It builds
the `context_summary` text from the oldest messages, then returns the **full original
list unchanged**:

```python
# context_manager.py
trim_count = max(settings.CONTEXT_WINDOW_SIZE // 2, 5)

if len(messages) <= trim_count:
    return thread_doc.get("context_summary", ""), messages  # Don't summarize yet

messages_to_summarize = messages[:trim_count]
remaining_messages = messages              # ← Full list, NOT messages[trim_count:]
```

**Why trimming was never needed:** `build_context_messages()` already slices
`raw_messages[-CONTEXT_WINDOW_SIZE:]` before sending to the LLM. The physical
MongoDB array doesn't need to be trimmed — the Python slice is the "window".

---

## Bug 8 — RAG Missing Edge-Case Responses

### The Problem
For broad questions ("what's the best feedback?"), the LLM generated generic search
queries ("positive customer feedback") that missed specific, rare responses like
"I got a complimentary gift." The gift response only appeared when the user explicitly
described it with exact wording.

### Why It Happened
The `search_feedback` tool description was vague:
```
"Search the customer feedback database for complaints, praise, or specific topics."
```
The LLM had no guidance on how to form a good search query.

### The Fix
Rewrote the tool description with explicit examples and anti-examples:
```python
@tool
def search_feedback(query: str) -> str:
    """Search the customer feedback database using semantic similarity.

    Args:
        query: A specific, descriptive search query based on the TOPIC you're
               looking for — NOT a restatement of the user's question.

               GOOD: 'staff rude cashier behavior', 'complimentary gift freebie reward'
               BAD:  'what do customers think', 'any feedback', 'best response'
    """
```
Also increased `k` from `5` → `8` for broader recall on edge-case documents.

---

## Files Changed — Summary

| File | What Changed |
|---|---|
| `app/vector/store.py` | Filter key paths `business_id` → `metadata.business_id`; index creation fixed; `min_score` 0.5 → 0.3 |
| `app/chat/nodes/stream_llm.py` | Phase 1: `astream()` → `ainvoke()`; Phase 3: history sanitization |
| `app/chat/nodes/execute_tools.py` | Clean source dict with `snippet`; better tool description; `k=8` |
| `app/chat/nodes/save.py` | `"sources": []` → `state.get("sources", [])` |
| `app/chat/engine.py` | `"sources": []` in initial_state; ainvoke fallback TokenEvent |
| `app/chat/utils/context_manager.py` | Stop trimming messages array; guard against empty list |
| `app/schemas/query.py` | `Source` fields all optional except `response_id`; `extra="ignore"` |

---

## Context Count Note

The system prompt says "49 analyzed responses" even though the form has 90 total.
This is **correct behavior** — `schema_context.py` counts only `ai_analysis.status = "done"`.
The remaining 41 responses have `status = "pending"` and haven't been processed by the
AI pipeline yet. They are also stored in Qdrant from when the pipeline ran successfully.
The LLM only sees the count of *fully analyzed* responses, but can still search all
embedded vectors (including ones processed before some analysis fields were missing).
