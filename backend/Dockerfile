# Dockerfile for container platforms (Render, Spaces, etc.).
# Use the PORT environment variable when provided (Render sets $PORT).
# Set DATABASE_URL, ALLOWED_ORIGINS, and DEBUG via environment variables / platform secrets.

FROM python:3.11-slim

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Force IPv4-only connections by disabling IPv6
ENV PYTHONUNBUFFERED=1
ENV CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# Run DB migrations then start the server. Use $PORT if provided, otherwise default to 7860.
# The migrations will only run if DATABASE_URL is set; the server starts regardless.
# Use -6 flag with addresses to prefer IPv4
CMD ["sh", "-c", "[ -z \"$DATABASE_URL\" ] || alembic upgrade head; uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
