"""
InsightLoop AI Service — MongoDB Async Connection (Stub)
========================================================
Manages the async MongoDB connection using motor.
Same MongoDB instance as the Node backend — shared database, separate concerns.

FastAPI reads: responses.answers (to process)
FastAPI writes: responses.ai_analysis (after processing)
FastAPI writes: ai_queries (query logs)

Connection is initialized once on startup via lifespan and reused.
"""

# TODO: Implement motor async MongoDB connection
# from motor.motor_asyncio import AsyncIOMotorClient
# from app.config import settings

_client = None
_db = None


async def get_db():
    """
    Returns the MongoDB database handle.

    On first call (from lifespan startup), creates the Motor client
    and connects to the database. Subsequent calls return the cached database.

    Returns:
        AsyncIOMotorDatabase: The insightloop MongoDB database handle.

    Usage:
        db = await get_db()
        doc = await db.responses.find_one({"response_id": response_id})

    TODO: Implement.
    """
    raise NotImplementedError("MongoDB connection not yet implemented.")


async def close_db():
    """
    Closes the MongoDB connection. Called on application shutdown.

    TODO: Implement.
    """
    raise NotImplementedError("MongoDB close not yet implemented.")
