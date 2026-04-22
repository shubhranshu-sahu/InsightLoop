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
    print(f"[MongoDB] Connected  →  {settings.MONGO_URI} / {settings.MONGO_DB_NAME}")


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
