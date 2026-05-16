import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import engine, Base, get_db
from routers import habits, entries, todos, analytics

# ── Configuration ─────────────────────────────────────────────────────────────
# Set DEBUG=true in .env for Swagger UI. Always disabled in production.
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# ALLOWED_ORIGINS: comma-separated list in env, e.g.:
#   ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app = FastAPI(
    title="Discipline Tracker API",
    version="1.0.0",
    docs_url="/docs" if DEBUG else None,
    redoc_url="/redoc" if DEBUG else None,
    openapi_url="/openapi.json" if DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.on_event("startup")
def startup_event():
    """Create database tables on first startup (idempotent)."""
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Warning: Could not create tables on startup: {e}")


app.include_router(habits.router)
app.include_router(entries.router)
app.include_router(todos.router)
app.include_router(analytics.router)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Health check — verifies the API is up and the DB is reachable."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unreachable"},
        )
