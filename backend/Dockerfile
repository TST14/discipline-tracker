# Dockerfile for container platforms (Render, Spaces, etc.).
# Use the PORT environment variable when provided (Render sets $PORT).
# Set DATABASE_URL, ALLOWED_ORIGINS, and DEBUG via environment variables / platform secrets.

FROM python:3.11-slim

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run DB migrations then start the server. Use $PORT if provided, otherwise default to 7860.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
