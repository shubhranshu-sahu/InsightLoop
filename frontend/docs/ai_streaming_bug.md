# LangGraph Streaming Leakage Bug Report
**For:** AI Service Developer (FastAPI/LangGraph)
**Context:** During integration testing between the new frontend chat interface and the AI service, we encountered a glitch where the AI appeared to output two conflicting responses joined together, but MongoDB only saved one of them.

## The Bug: Unfiltered `astream_events`
**The symptom:**
When the user typed "are you awake ?", the frontend rendered:
> *"Yes, I am here and ready to assist you. I am a digital analytics assistant, so I am always available to help you process your feedback data. What would you like to know about your 42 responses from theYes, I am here and ready to assist you with your feedback data. How can I help you analyze the 42 responses from your "Feedback Form" today?"*

However, MongoDB only stored the second half:
> *"Yes, I am here and ready to assist you with your feedback data..."*

**The Root Cause:**
When iterating over LangGraph's `graph.astream_events()`, the event `"on_chat_model_stream"` catches the token streams of **EVERY** LLM call made anywhere inside the graph. 
If your `build_context` node (or any other node before `stream_llm`) uses an LLM to summarize history, route intents, or extract queries, those internal "thinking" tokens are leaking into the public Server-Sent Events (SSE) stream. Because the internal LLM call isn't the final answer, it is correctly omitted from the final `save_node` to MongoDB, but the frontend has already displayed it to the user.

## How to Fix It
You must filter the streaming events in your FastAPI SSE endpoint (or `engine.py`) to only yield tokens that originate specifically from your `stream_llm` node (or the final output LLM).

**Bad Implementation (Leaky):**
```python
async for event in chat_graph.astream_events(inputs, version="v1"):
    if event["event"] == "on_chat_model_stream":
        chunk = event["data"]["chunk"].content
        if chunk:
            yield f'data: {json.dumps({"type":"token", "token": chunk})}\n\n'
```

**Correct Implementation (Filtered):**
```python
async for event in chat_graph.astream_events(inputs, version="v1"):
    # ONLY stream tokens if they come from the node named 'stream_llm'
    # Or filter by the specific name of the ChatOpenAI/ChatGoogle model used for the final response.
    
    # NOTE: The exact filter depends on your node names or tag names.
    # If the node name is "stream_llm", the event name might be the model's name (e.g. "ChatOpenAI"),
    # so it's safer to filter by tags. You can pass tags=["final_node"] when calling the LLM.
    
    if event["event"] == "on_chat_model_stream":
        # Example: if you tagged your final LLM call with tags=["final_output"]
        if "final_output" in event.get("tags", []):
            chunk = event["data"]["chunk"].content
            if chunk:
                yield f'data: {json.dumps({"type":"token", "token": chunk})}\n\n'
```

### Action Items for the AI Backend:
1. Identify all LLM calls inside your graph (e.g., inside `build_context`, tool definitions, routing).
2. Add a specific tag to the LLM call inside your `stream_llm` node: `llm.with_config(tags=["final_output"]).stream(...)` (or similar).
3. In your FastAPI endpoint that generates the SSE stream, check `event.get("tags")` or `event["name"]` before yielding the token.
4. (Optional but recommended) Emit a `data: {"type":"done", "sources": [...]}` event when the graph finishes, so the frontend knows to unlock the UI and render citations.
