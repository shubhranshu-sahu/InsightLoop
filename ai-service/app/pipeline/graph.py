"""
InsightLoop AI Service — LangGraph Pipeline Graph
==================================================
Wires the four pipeline nodes into a LangGraph StateGraph and
compiles it into a single runnable graph object.

Graph topology (linear — no branching):
    analyze_text → derive_overall → summarize → embed_store → END

Node summary:
    1. analyze_text   — 1 LLM call  — NLP on all text answers
    2. derive_overall — 0 LLM calls — rule-based overall metrics
    3. summarize      — 1 LLM call  — 1-2 sentence summary
    4. embed_store    — 0 LLM calls — ChromaDB + MongoDB writes (skipped in dev)

Total LLM calls per response: 2

Modifying the pipeline:
    - To add a node:    add a new node file, add_node() + add_edge() here
    - To remove a node: remove add_node() + relink edges around it
    - To reorder nodes: change the add_edge() sequence
    - The FeedbackState TypedDict must be updated to match any field changes

Usage:
    from app.pipeline.graph import feedback_graph
    final_state = await feedback_graph.ainvoke(initial_state)
"""

from langgraph.graph import END, StateGraph

from app.pipeline.nodes.analyze_text import analyze_text_node
from app.pipeline.nodes.derive_overall import derive_overall_node
from app.pipeline.nodes.embed_store import embed_store_node
from app.pipeline.nodes.summarize import summarize_node
from app.pipeline.state import FeedbackState


def build_feedback_graph():
    """
    Build and compile the LangGraph StateGraph for feedback processing.

    Registers all four nodes and connects them in a linear sequence.
    The compiled graph is safe to call concurrently — each ainvoke()
    creates an independent state copy.

    Returns:
        CompiledGraph: Ready for `await feedback_graph.ainvoke(state)`.
    """
    graph = StateGraph(FeedbackState)

    # ── Register nodes ───────────────────────────────────────────────────────
    graph.add_node("analyze_text",   analyze_text_node)
    graph.add_node("derive_overall", derive_overall_node)
    graph.add_node("summarize",      summarize_node)
    graph.add_node("embed_store",    embed_store_node)

    # ── Define edges (execution order) ───────────────────────────────────────
    graph.set_entry_point("analyze_text")

    graph.add_edge("analyze_text",   "derive_overall")
    graph.add_edge("derive_overall", "summarize")
    graph.add_edge("summarize",      "embed_store")
    graph.add_edge("embed_store",    END)

    return graph.compile()


# ── Singleton ─────────────────────────────────────────────────────────────────
# Compiled once at import time. Imported by routes/analyze.py.
# graph.compile() is cheap — it just builds the execution plan.
feedback_graph = build_feedback_graph()
