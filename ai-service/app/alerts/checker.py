"""
InsightLoop AI Service — Alert Threshold Checker (Stub)
========================================================
Runs after every successful /analyze call to check if a high-urgency
response cluster should trigger an alert for the business owner.

Status: NOT IMPLEMENTED — MySQL not available in current development environment.
        This function exists as a proper stub. It is called from routes/analyze.py
        inside a try/except block so it NEVER breaks the /analyze response.

When MySQL becomes available:
    1. Implement init_mysql() and get_mysql_pool() in app/db/mysql.py
    2. Implement the body of check_and_create_alerts() below
    3. No changes needed in routes/analyze.py — it already calls this function

Trigger logic (when implemented):
    CONDITION:
        urgency == "high"
        AND count(responses with urgency="high" for this form in last ALERT_WINDOW_HOURS)
            >= ALERT_HIGH_URGENCY_THRESHOLD

    ACTION:
        INSERT IGNORE INTO alerts (...) VALUES (...)
        "INSERT IGNORE" prevents duplicate alerts for the same threshold breach.
        The business owner sees the alert on their dashboard (Node reads alerts).

Alert types:
    "high_urgency_spike"  — cluster of high-urgency responses in a short window
    (future) "low_rating_drop"    — avg rating dropped significantly
    (future) "recurring_complaint" — same complaint topic repeating

MySQL alerts table schema (owned by Node backend):
    alert_id    VARCHAR(36) PRIMARY KEY DEFAULT (UUID())
    business_id VARCHAR(36) NOT NULL
    form_id     VARCHAR(36)
    alert_type  VARCHAR(100) NOT NULL
    message     TEXT NOT NULL
    is_read     BOOLEAN DEFAULT FALSE
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
"""

from datetime import datetime, timedelta, timezone

from app.pipeline.state import FeedbackState


async def check_and_create_alerts(state: FeedbackState) -> None:
    """
    Check alert thresholds and write to MySQL alerts table if triggered.

    This function is a NO-OP in the current environment (MySQL not configured).
    It raises NotImplementedError which is caught silently in routes/analyze.py.

    Args:
        state (FeedbackState): The completed pipeline state for the processed response.
            Reads: urgency, form_id, business_id.

    Returns:
        None — side effect only. May write one row to MySQL alerts table.

    Raises:
        NotImplementedError: Always (until MySQL is configured).

    Full implementation (paste here when MySQL is ready):

        from app.db.mongo import get_db
        from app.db.mysql import get_mysql_pool
        from app.config import settings

        # 1. Fast path — only high-urgency responses trigger alerts
        if state["urgency"] != "high":
            return

        # 2. Count high-urgency responses for this form in the window
        db = await get_db()
        window_start = datetime.now(timezone.utc) - timedelta(
            hours=settings.ALERT_WINDOW_HOURS
        )
        count = await db.responses.count_documents({
            "form_id":             state["form_id"],
            "business_id":         state["business_id"],
            "ai_analysis.urgency": "high",
            "submitted_at":        {"$gte": window_start},
        })

        # 3. Threshold check → write alert
        if count >= settings.ALERT_HIGH_URGENCY_THRESHOLD:
            pool = await get_mysql_pool()
            async with pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        \"""
                        INSERT IGNORE INTO alerts
                            (alert_id, business_id, form_id, alert_type, message)
                        VALUES
                            (UUID(), %s, %s, %s, %s)
                        \""",
                        (
                            state["business_id"],
                            state["form_id"],
                            "high_urgency_spike",
                            f"{count} high-urgency complaint(s) received in the "
                            f"last {settings.ALERT_WINDOW_HOURS} hours.",
                        ),
                    )
                await conn.commit()
    """
    # TODO: Remove this raise and paste the full implementation above
    # when MySQL is configured.
    raise NotImplementedError(
        "Alert checker requires MySQL — not yet configured. "
        "This error is caught silently in routes/analyze.py."
    )
