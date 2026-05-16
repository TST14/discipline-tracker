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

# Start the server without running migrations on startup.
# Migrations should be run manually or via a separate deployment step.
# Use $PORT if provided, otherwise default to 7860.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
