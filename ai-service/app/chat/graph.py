"""
InsightLoop AI Service — Chat LangGraph Graph
===============================================
Imports all chat nodes and compiles the LangGraph StateGraph.

Pattern mirrors app/pipeline/graph.py (the /analyze pipeline).

Graph topology (Phase 1):
    load_thread → build_context → stream_llm → save

The graph is compiled once at module import time. Compilation validates
the node connections and pre-computes the execution plan. After compile(),
the graph is immutable.
"""

from langgraph.graph import END, START, StateGraph

from app.chat.nodes.build_context import build_context_node
from app.chat.nodes.execute_tools import execute_tools_node
from app.chat.nodes.load_thread import load_thread_node
from app.chat.nodes.save import save_node
from app.chat.nodes.stream_llm import stream_node
from app.chat.state import ChatState


def should_continue(state: ChatState) -> str:
    """
    Determine if the LLM output a tool call or a final answer.
    """
    if state.get("error"):
        return "save"
    
    last_message = state.get("lc_messages", [])[-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "execute_tools"
    return "save"


def _build_graph() -> object:
    """
    Assemble and compile the chat LangGraph StateGraph.

    Why StateGraph?
        StateGraph is LangGraph's graph type for stateful pipelines. It:
          - Takes a TypedDict as the state schema (ChatState)
          - Routes each node's returned dict back into the state
          - Handles async nodes correctly
          - Provides astream_events() for streaming
    """
    builder = StateGraph(ChatState)

    # Add all nodes
    builder.add_node("load_thread",   load_thread_node)
    builder.add_node("build_context", build_context_node)
    builder.add_node("stream_llm",    stream_node)        # Name in events: "stream_llm"
    builder.add_node("execute_tools", execute_tools_node)
    builder.add_node("save",          save_node)

    # Wire them in a linear sequence: START → each node → END
    builder.add_edge(START,           "load_thread")
    builder.add_edge("load_thread",   "build_context")
    builder.add_edge("build_context", "stream_llm")
    
    # Conditional edge out of stream_llm
    builder.add_conditional_edges(
        "stream_llm",
        should_continue,
        {
            "execute_tools": "execute_tools",
            "save": "save"
        }
    )
    
    # After tools are executed, go back to the LLM to synthesize the final answer
    builder.add_edge("execute_tools", "stream_llm")
    
    builder.add_edge("save",          END)

    # compile() validates the graph and prepares it for execution.
    # After compile(), the graph is immutable.
    return builder.compile()


# The compiled graph — one instance shared across all requests
chat_graph = _build_graph()
