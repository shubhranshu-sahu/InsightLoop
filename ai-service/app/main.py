"""
InsightLoop AI Service — Main Application Entry Point
======================================================
Initializes the FastAPI application, registers middleware, includes routers,
and manages the application lifespan (startup / shutdown events).

Run with:
    uvicorn app.main:app --reload --port 8000

API Docs (auto-generated):
    http://localhost:8000/docs      ← Swagger UI
    http://localhost:8000/redoc     ← ReDoc
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import settings
from app.routes import analyze, health

# ── Future route imports (uncomment as each module is implemented) ─────────────
# from app.routes import query
# from app.routes import summary


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application startup and shutdown events.

    Startup:
        - Initialize async DB connections (MongoDB via motor, MySQL via aiomysql)
        - Load or create the ChromaDB vector store
        - Run the retry worker once (pick up any pending/failed responses)
        - Start APScheduler for the periodic retry cron job

    Shutdown:
        - Close DB connections cleanly
        - Stop the scheduler
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    print("[InsightLoop AI] Starting up...")

    # MongoDB (required — pipeline writes ai_analysis after every /analyze call)
    from app.db.mongo import init_mongo, close_mongo
    await init_mongo()

    # MySQL (optional — only needed for alert checker)
    # NotImplementedError is expected until MySQL is configured.
    from app.db.mysql import init_mysql, close_mysql
    try:
        await init_mysql()
    except NotImplementedError:
        print("[MySQL] Not configured — alert checker disabled.")
    except Exception as exc:
        print(f"[MySQL] Connection failed (non-critical): {exc}")

    # TODO: Load / initialize ChromaDB vector store on startup (optional warm-up)
    # from app.vector.store import get_vector_store
    # get_vector_store()   # Pre-loads the store so the first /analyze is fast

    # TODO: Run retry worker on startup (Phase 4)
    # from app.workers.retry import retry_pending_responses
    # await retry_pending_responses()

    # TODO: Start APScheduler for periodic retry (Phase 4)
    # scheduler.add_job(retry_pending_responses, "interval", minutes=30)
    # scheduler.start()

    print(f"[InsightLoop AI] Ready — LLM: {settings.GEMINI_LLM_MODEL} | Vector Store: {settings.VECTOR_STORE_BACKEND}")

    yield  # ← Application runs here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    print("[InsightLoop AI] Shutting down...")
    await close_mongo()
    await close_mysql()
    # TODO: Shutdown APScheduler (Phase 4)


# ── Application Instance ──────────────────────────────────────────────────────

app = FastAPI(
    title="InsightLoop AI Service",
    description="""
## InsightLoop AI Microservice

Processes customer feedback responses, generates AI insights, manages vector embeddings,
and powers the natural-language RAG chat system for business owners.

### Authentication

All endpoints **except `/health`** require the following header:

```
X-Internal-Secret: <shared secret>
```

Missing or incorrect header → **403 Forbidden**.

### Called By

Node.js backend only. This service is never called directly from the frontend.

### Stack

- **LLM:** Google Gemini (`gemini-2.0-flash`)
- **Embeddings:** Gemini (`text-embedding-004`)
- **Vector Store:** ChromaDB (local) → Qdrant (on deploy)
- **Pipeline:** LangGraph
    """,
    version="1.0.0",
    contact={
        "name": "Shubhranshu (InsightLoop AI)",
    },
    lifespan=lifespan,
    # Disable default 422 response docs clutter on every route
    # openapi_tags defined below
)


# ── CORS Middleware ───────────────────────────────────────────────────────────
# In production, restrict allow_origins to the Node backend URL only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Internal Secret Middleware ────────────────────────────────────────────────

@app.middleware("http")
async def verify_internal_secret(request: Request, call_next):
    """
    Validates the X-Internal-Secret header on every incoming request.

    Exempt paths (no header needed):
        - /health        — liveness probe
        - /docs          — Swagger UI
        - /redoc         — ReDoc
        - /openapi.json  — OpenAPI schema

    All other paths require:
        X-Internal-Secret: <INTERNAL_SECRET value from .env>

    Returns:
        403 Forbidden — if header is missing or does not match.
    """
    EXEMPT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}

    if request.url.path in EXEMPT_PATHS:
        return await call_next(request)

    secret = request.headers.get("X-Internal-Secret")
    if not secret or secret != settings.INTERNAL_SECRET:
        return JSONResponse(
            status_code=403,
            content={
                "error": "Forbidden",
                "detail": "Missing or invalid X-Internal-Secret header.",
            },
        )

    return await call_next(request)


# ── Router Registration ───────────────────────────────────────────────────────

app.include_router(health.router,   tags=["Health"])
app.include_router(analyze.router,  tags=["Analysis"])

# Uncomment each router as its implementation is complete:
# app.include_router(query.router,   tags=["Chat"])
# app.include_router(summary.router, tags=["Reports"])


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    """Redirects root URL to the interactive API docs."""
    return RedirectResponse(url="/docs")
