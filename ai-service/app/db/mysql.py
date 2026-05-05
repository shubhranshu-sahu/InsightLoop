"""
InsightLoop AI Service — MySQL Async Connection Pool
=====================================================
Manages the async MySQL connection pool using aiomysql.

FastAPI uses MySQL for:
    - READS:  questions table (for schema context in chat)
    - READS:  feedback_forms table (for form title in chat)
    - WRITES: alerts table (after high-urgency threshold is crossed)

Node backend owns all other MySQL tables. FastAPI never writes to them.

Connection lifecycle:
    - init_mysql()      called once on FastAPI startup (lifespan)
    - get_mysql_pool()  called per-request to get the pool handle
    - close_mysql()     called once on FastAPI shutdown (lifespan)

Cloud migration:
    Local:  MYSQL_HOST=localhost, MYSQL_SSL=false
    Cloud:  MYSQL_HOST=<rds/planetscale host>, MYSQL_SSL=true
    Zero code changes needed — only .env values change.

Usage:
    from app.db.mysql import get_mysql_pool
    pool = await get_mysql_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT ...", params)
            rows = await cur.fetchall()
"""

import ssl as ssl_module

import aiomysql

from app.config import settings

_pool: aiomysql.Pool | None = None


async def init_mysql() -> None:
    """
    Create the aiomysql async connection pool.

    Called from FastAPI lifespan startup. If MySQL is unreachable,
    the exception propagates — the caller in main.py catches it
    and logs a warning (non-fatal; only alerts + schema_context are disabled).

    SSL handling:
        When MYSQL_SSL=true, we create a default SSL context. This is required
        by most cloud MySQL providers (PlanetScale, AWS RDS, etc.).
        Local MySQL typically doesn't need SSL.
    """
    global _pool

    # Build SSL context if needed (cloud MySQL providers require this)
    ssl_ctx = None
    if settings.MYSQL_SSL:
        ssl_ctx = ssl_module.create_default_context()
        # Some cloud providers use self-signed certs — disable hostname check
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl_module.CERT_NONE

    _pool = await aiomysql.create_pool(
        host=settings.MYSQL_HOST,
        port=settings.MYSQL_PORT,
        user=settings.MYSQL_USER,
        password=settings.MYSQL_PASSWORD,
        db=settings.MYSQL_DB,
        minsize=settings.MYSQL_POOL_MIN,
        maxsize=settings.MYSQL_POOL_MAX,
        autocommit=False,
        ssl=ssl_ctx,
        connect_timeout=10,
    )

    # Verify connection by running a simple query
    async with _pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT 1")

    print(
        f"[MySQL] Connected → {settings.MYSQL_HOST}:{settings.MYSQL_PORT}"
        f"/{settings.MYSQL_DB}"
        f"{' (SSL)' if settings.MYSQL_SSL else ''}"
    )


async def get_mysql_pool() -> aiomysql.Pool:
    """
    Return the aiomysql connection pool.

    Returns:
        aiomysql.Pool: The initialized connection pool.

    Raises:
        RuntimeError: If init_mysql() was never called or failed.
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
    """
    global _pool
    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()
        _pool = None
        print("[MySQL] Connection pool closed.")
