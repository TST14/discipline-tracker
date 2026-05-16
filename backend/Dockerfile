# Dockerfile for container platforms (Render, Spaces, etc.).
# Use the PORT environment variable when provided (Render sets $PORT).
# Set DATABASE_URL, ALLOWED_ORIGINS, and DEBUG via environment variables / platform secrets.

FROM python:3.11-slim

WORKDIR /code

# Prefer IPv4 over IPv6 for DNS resolution
ENV PYTHONUNBUFFERED=1
ENV GLIBC_TUNABLES=gai=ipv4only

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run DB migrations then start the server. Use $PORT if provided, otherwise default to 7860.
# The migrations will only run if DATABASE_URL is set; the server starts regardless.
CMD ["sh", "-c", "[ -z \"$DATABASE_URL\" ] || alembic upgrade head; uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
