"""
InsightLoop AI Service — Retry Worker (Stub)
============================================
Finds feedback responses that failed or were never processed,
and reprocesses them through the LangGraph pipeline.

Run on: FastAPI startup + every 30 minutes via APScheduler.

Retry query:
    ai_analysis.status in ["pending", "failed"]
    AND submitted_at < now - 5 minutes     (give time for normal processing)
    AND ai_analysis.retry_count < 3        (don't retry indefinitely)

On each retry attempt:
    - Increment retry_count first
    - Re-run feedback_graph.ainvoke(state)
    - On success: MongoDB status becomes "done" (set by embed_store_node)
    - On failure: Set status="failed" with error message
"""


async def retry_pending_responses() -> None:
    """
    Scan MongoDB for unprocessed responses and reprocess them.

    Called on startup and by APScheduler every 30 minutes.
    Processes up to 100 responses per run to avoid blocking.

    Returns:
        None

    TODO: Implement after pipeline (feedback_graph) is working.
    """
    # TODO:
    # 1. Query MongoDB for pending/failed responses older than 5 minutes
    # 2. For each: increment retry_count, reinvoke feedback_graph
    # 3. On error: set status="failed" + error message
    print("[Retry Worker] Not yet implemented — skipping.")
