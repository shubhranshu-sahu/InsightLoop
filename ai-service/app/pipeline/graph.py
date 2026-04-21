"""
InsightLoop AI Service — LangGraph Pipeline Graph (Stub)
=========================================================
Wires the pipeline nodes into a LangGraph StateGraph.

Node design and count are TBD — this file will be implemented
once the pipeline is finalized.

Expected structure (subject to change):
    analyze_text → derive_overall → summarize → embed_store → END
"""

# TODO: Import and wire nodes once pipeline design is decided
# from langgraph.graph import StateGraph, END
# from app.pipeline.state import FeedbackState
# from app.pipeline.nodes.analyze_text import analyze_text_node
# from app.pipeline.nodes.derive_overall import derive_overall_node
# from app.pipeline.nodes.summarize import summarize_node
# from app.pipeline.nodes.embed_store import embed_store_node


def build_feedback_graph():
    """
    Build and compile the LangGraph StateGraph for feedback processing.

    Returns:
        CompiledGraph: The compiled graph ready for ainvoke().

    TODO: Implement once node design is finalized.
    """
    raise NotImplementedError("Pipeline graph not yet implemented. Design TBD.")


# Singleton — imported by routes/analyze.py
# feedback_graph = build_feedback_graph()
