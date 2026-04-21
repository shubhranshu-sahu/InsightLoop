"""
InsightLoop AI Service — MySQL Async Connection (Stub)
======================================================
Manages the async MySQL connection pool using aiomysql.
Same MySQL instance as the Node backend.

FastAPI reads: questions table (for schema context in chat)
FastAPI writes: alerts table (after processing high-urgency responses)

Uses an async context manager pattern for safe connection handling.
"""

# TODO: Implement aiomysql connection pool
# import aiomysql
# from app.config import settings

_pool = None


async def get_mysql_pool():
    """
    Returns the MySQL async connection pool.

    Creates the pool on first call using settings.MYSQL_* values.
    The pool is created once and reused across requests.

    Returns:
        aiomysql.Pool: The connection pool.

    TODO: Implement.
    """
    raise NotImplementedError("MySQL pool not yet implemented.")


async def close_mysql_pool():
    """
    Closes the MySQL connection pool. Called on application shutdown.

    TODO: Implement.
    """
    raise NotImplementedError("MySQL close not yet implemented.")
