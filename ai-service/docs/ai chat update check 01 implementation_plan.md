# Chat System Implementation Plan: Bug Fixes & Phase 2 (RAG)

## Phase 1 Status: ✅ Completed!
We have successfully completed Phase 1. The core foundation is solid:
- `engine.py` manages the SSE stream correctly.
- `graph.py` successfully orchestrates `load_thread` → `build_context` → `stream_llm` → `save`.
- MongoDB context summarization and storage are fully functional.

## The Streaming Leakage Bug (Immediate Fix)

**The Problem:** Currently, `engine.py` indiscriminately streams **every** LLM token it intercepts. If we add an LLM call earlier in the graph (like generating a RAG search query), those "internal thought" tokens leak to the frontend.

**The Fix:**
1. **[MODIFY] `app/chat/nodes/stream_llm.py`:** Update the LLM call to attach a specific tag: `llm.with_config(tags=["final_output"]).astream(...)`.
2. **[MODIFY] `app/chat/engine.py`:** Update the event loop to check `if "final_output" in event.get("tags", [])` before yielding tokens to the SSE stream. This guarantees only the final, formatted answer is streamed to the user.

---

## Moving to Phase 2: RAG Integration

You asked a brilliant question: *Why not ask the LLM if RAG is needed in the same call to minimize latency? And how do we generate a context-filled query?*

Instead of a slow "Router LLM" → "Search" → "Answer LLM" pipeline, we will use **Native LLM Tool Calling (Function Calling)**. 

### Proposed RAG Architecture (Tool Calling)

1. **The Tool Definition:** We create a Python function `search_feedback(query: str)` wrapped as a LangChain tool. We give this tool to the Gemini model in `stream_llm.py` (`llm.bind_tools([search_feedback])`).
2. **The LLM's Decision:** 
   - If the user says "Hello", the LLM streams the answer immediately (1 LLM call, lowest latency).
   - If the user says "What complaints did we get about cold food?", the LLM recognizes it needs data. It *stops* streaming text and instead outputs a structured "Tool Call" requesting a search for "complaints about cold food".
3. **The LangGraph Execution:**
   - The graph pauses `stream_llm`, routes to a new `execute_tools` node, runs the Qdrant search, appends the vector results to the message history, and routes *back* to `stream_llm`.
   - The LLM then reads the fresh data and streams the final answer (tagged as `final_output` so the frontend sees it).

### [NEW] `app/chat/nodes/execute_tools.py`
This node will handle the actual Qdrant vector search.
> [!IMPORTANT]
> **Metadata Filtering is Mandatory!** 
> To prevent cross-tenant data leaks, the Qdrant search **must** include a strict metadata filter: `{"business_id": state["business_id"], "form_id": state["form_id"]}`. The LLM generates the text query, but we hardcode the metadata filters using the current chat session's state.

### [MODIFY] `app/chat/state.py`
Add a new field `sources: list[dict]` to the `ChatState`. When the `execute_tools` node retrieves documents from Qdrant, it will extract the `response_id` from their metadata and append it to this list.

### [MODIFY] `app/chat/graph.py`
Update the graph topology to support conditional tool routing:
```text
build_context ──► stream_llm ──(tools called?)──► execute_tools ──► (back to stream_llm)
                       │
                 (no tools called)
                       ▼
                     save
```

### Citations and the Frontend
How do citations go safely to the frontend? 
In `app/chat/engine.py` (lines 179-180), we already have the `DoneEvent(sources=...)` payload. When the graph reaches the `END` node, `engine.py` will read `state["sources"]`, deduplicate them, and yield them in the final SSE `data: {"type": "done", "sources": [{"response_id": "..."}]} \n\n`. 
Node.js simply pipes this stream. The frontend Javascript (`chat.js`) intercepts the `"done"` event, reads the `sources` array, and renders the clickable citation bubbles below the chat message!

## Open Questions

> [!WARNING]  
> Are you ready for me to implement these Phase 2 changes (updating the graph, adding the Qdrant tool node, and fixing the streaming leak), or do you want to start with *just* the streaming leak fix first?
