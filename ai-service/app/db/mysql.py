"""
InsightLoop AI Service — MySQL Async Connection Pool (Stub)
============================================================
Manages the async MySQL connection pool using aiomysql.

Status: NOT IMPLEMENTED — MySQL not available in current development environment.
        This file exists as a proper stub so alert checker code can reference it
        and the lifespan handler can call it safely (wrapped in try/except).

When MySQL becomes available:
    1. Ensure aiomysql is installed (it's in requirements.txt already)
    2. Implement init_mysql(), get_mysql_pool(), close_mysql() below
    3. No changes needed in routes/analyze.py or main.py — they already
       call these functions with proper error handling.

FastAPI uses MySQL for:
    - READS:  questions table (for schema context in chat, Phase 3)
    - WRITES: alerts table (after high-urgency threshold is crossed)

Node backend owns all other MySQL tables. FastAPI never writes to them.

Usage (once implemented):
    from app.db.mysql import get_mysql_pool
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT ...", params)
            rows = await cur.fetchall()
"""

import aiomysql

from app.config import settings

_pool: aiomysql.Pool | None = None


async def init_mysql() -> None:
    """
    Create the aiomysql async connection pool.

    Called from FastAPI lifespan startup (wrapped in try/except — failure
    does not prevent the app from starting; only alerts are disabled).

    TODO: Implement when MySQL is available.
          Replace NotImplementedError with the actual pool creation:

        global _pool
        _pool = await aiomysql.create_pool(
            host=settings.MYSQL_HOST,
            port=settings.MYSQL_PORT,
            user=settings.MYSQL_USER,
            password=settings.MYSQL_PASSWORD,
            db=settings.MYSQL_DB,
            minsize=1,
            maxsize=5,
            autocommit=False,
        )
        print(f"[MySQL] Connected  →  {settings.MYSQL_HOST}:{settings.MYSQL_PORT}/{settings.MYSQL_DB}")
    """
    raise NotImplementedError(
        "MySQL connection not yet configured. "
        "Alert checker and schema-context queries are disabled until MySQL is set up."
    )


async def get_mysql_pool() -> aiomysql.Pool:
    """
    Return the aiomysql connection pool.

    Raises:
        RuntimeError: If init_mysql() was never called successfully.

    TODO: Implement body when MySQL is available.
    """
    if _pool is None:
        raise RuntimeError(
            "MySQL pool is not initialized. "
            "Call init_mysql() in the lifespan startup handler."
        )
    return _pool


async def close_mysql() -> None:
    """
    Close the MySQL connection pool gracefully.

    Called from FastAPI lifespan shutdown. Safe if pool was never initialized.

    TODO: Uncomment when init_mysql() is implemented.
    """
    global _pool
    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()
        _pool = None
        print("[MySQL] Connection pool closed.")
