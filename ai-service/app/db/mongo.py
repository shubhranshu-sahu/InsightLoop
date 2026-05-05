"""
InsightLoop AI Service — MongoDB Async Connection
==================================================
Manages the async MongoDB connection using motor (Motor AsyncIO).

This service shares the same MongoDB instance as the Node backend.
Division of ownership:
    Node backend writes:  responses.answers, responses.ai_analysis (initial stub)
    FastAPI writes:       responses.ai_analysis ($set after processing)
    FastAPI writes:       ai_queries (query logs, Phase 3)
    FastAPI reads:        responses (to find pending/failed for retry worker)

Connection lifecycle:
    - init_mongo()  called once on FastAPI startup (lifespan)
    - get_db()      called per-request to get the database handle
    - close_mongo() called once on FastAPI shutdown (lifespan)

The Motor client maintains an internal connection pool — a single client
instance is sufficient for the entire application lifetime.

Usage:
    from app.db.mongo import get_db
    db = await get_db()
    doc = await db.responses.find_one({"response_id": response_id})
    await db.responses.update_one({"response_id": rid}, {"$set": {...}})
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

# Module-level Motor client — initialized once, never replaced
_client: AsyncIOMotorClient | None = None


async def init_mongo() -> None:
    """
    Initialize the Motor async MongoDB client and verify the connection.

    Called once from the FastAPI lifespan startup handler in main.py.
    Raises on connection failure so the app fails fast if MongoDB is unreachable.

    Raises:
        Exception: If MongoDB is unreachable or auth fails.
    """
    global _client
    _client = AsyncIOMotorClient(settings.MONGO_URI)

    # Verify connection by pinging the admin database
    await _client.admin.command("ping")
    print(f"[MongoDB] Connected -> {settings.MONGO_URI} / {settings.MONGO_DB_NAME}")


async def get_db() -> AsyncIOMotorDatabase:
    """
    Return the Motor database handle for the insightloop database.

    This is the primary entry point for all MongoDB operations in the service.
    The client is created once; the database handle is a lightweight object
    derived from the client — calling this function is essentially free.

    Returns:
        AsyncIOMotorDatabase: Handle to the configured MongoDB database.

    Raises:
        RuntimeError: If called before init_mongo() (i.e., before startup).

    Usage:
        db = await get_db()
        result = await db.responses.find_one({"response_id": "uuid-123"})
        await db.responses.update_one(
            {"response_id": "uuid-123"},
            {"$set": {"ai_analysis.status": "done"}}
        )
    """
    if _client is None:
        raise RuntimeError(
            "MongoDB client is not initialized. "
            "Ensure init_mongo() is called in the FastAPI lifespan startup."
        )
    return _client[settings.MONGO_DB_NAME]


async def create_indexes() -> None:
    """
    Create MongoDB indexes. Called once on startup. Idempotent.

    create_index() is idempotent — if the index already exists, it does nothing.
    This is safe to call on every startup without side effects.

    Indexes created:
        chat_threads:
            - (business_id, form_id) unique — primary lookup, enforces one-thread-per-form
            - (thread_id) unique — direct lookup by ID inside graph nodes
            - (business_id, updated_at desc) — sidebar list sorted by recent activity

        responses:
            - (form_id, business_id) — RAG retrieval filter, schema context query
            - (ai_analysis.status) — retry worker finds pending/failed docs
            - (form_id, submitted_at desc) — date-range queries in data tool
            - (response_id) unique — direct lookup by response ID
    """
    db = _client[settings.MONGO_DB_NAME]

    # ── chat_threads ──────────────────────────────────────────────────────────
    await db.chat_threads.create_index(
        [("business_id", 1), ("form_id", 1)], unique=True
    )
    await db.chat_threads.create_index(
        [("thread_id", 1)], unique=True
    )
    await db.chat_threads.create_index(
        [("business_id", 1), ("updated_at", -1)]
    )

    # ── responses ─────────────────────────────────────────────────────────────
    await db.responses.create_index(
        [("form_id", 1), ("business_id", 1)]
    )
    await db.responses.create_index(
        [("ai_analysis.status", 1)]
    )
    await db.responses.create_index(
        [("form_id", 1), ("submitted_at", -1)]
    )
    await db.responses.create_index(
        [("response_id", 1)], unique=True
    )

    print("[MongoDB] Indexes created/verified.")


async def close_mongo() -> None:
    """
    Close the Motor MongoDB client and release the connection pool.

    Called from the FastAPI lifespan shutdown handler in main.py.
    Safe to call even if init_mongo() was never called.
    """
    global _client
    if _client is not None:
        _client.close()
        _client = None
        print("[MongoDB] Connection closed.")
