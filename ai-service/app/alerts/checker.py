"""
InsightLoop AI Service — Alert Threshold Checker (Stub)
=======================================================
Runs after every successful /analyze call.
Checks if high-urgency response count exceeds the configured threshold.
If so, creates an alert record in MySQL alerts table.

Trigger condition:
    urgency == "high" AND
    count(high-urgency for this form in last ALERT_WINDOW_HOURS) >= ALERT_HIGH_URGENCY_THRESHOLD

Alert type: "high_urgency_spike"
INSERT IGNORE prevents duplicate alerts for the same threshold breach.
"""

from app.pipeline.state import FeedbackState


async def check_and_create_alerts(state: FeedbackState) -> None:
    """
    Check alert thresholds and write to MySQL alerts table if triggered.

    Only runs when the current response has urgency = "high".
    Queries MongoDB for high-urgency count in the configured window.
    Writes to MySQL if threshold is crossed.

    Args:
        state (FeedbackState): Completed pipeline state for the processed response.

    Returns:
        None (side effect: may write to MySQL alerts table)

    TODO: Implement after DB connections and pipeline are working.
    """
    # TODO:
    # 1. Check if state["urgency"] == "high" — if not, return early
    # 2. Query MongoDB: count responses with urgency=high for this form in window
    # 3. If count >= settings.ALERT_HIGH_URGENCY_THRESHOLD:
    #    INSERT IGNORE INTO alerts (...) VALUES (...)
    raise NotImplementedError("Alert checker not yet implemented.")
