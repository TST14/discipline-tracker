# Dockerfile for container platforms (Render, Spaces, etc.).
# Use the PORT environment variable when provided (Render sets $PORT).
# Set DATABASE_URL, ALLOWED_ORIGINS, and DEBUG via environment variables / platform secrets.

FROM python:3.11-slim

WORKDIR /code

# Prefer IPv4 over IPv6 for DNS resolution
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Boot sequence:
#  1. create_all        — ensures all tables exist (idempotent, safe on every start)
#  2. alembic upgrade   — applies any pending schema migrations (IF NOT EXISTS guards)
#  3. uvicorn           — starts the API server
# Use $PORT if provided (Render sets it), otherwise default to 7860.
CMD ["sh", "-c", "python -c 'import models; from database import engine, Base; Base.metadata.create_all(bind=engine)' && alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
