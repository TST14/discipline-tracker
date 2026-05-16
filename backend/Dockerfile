# Dockerfile for container platforms (Render, Spaces, etc.).
# Use the PORT environment variable when provided (Render sets $PORT).
# Set DATABASE_URL, ALLOWED_ORIGINS, and DEBUG via environment variables / platform secrets.

FROM python:3.11-slim

WORKDIR /code

# Disable IPv6 in the container and configure gai.conf to prefer IPv4
RUN echo "net.ipv6.conf.all.disable_ipv6 = 1" >> /etc/sysctl.conf && \
    echo "net.ipv6.conf.default.disable_ipv6 = 1" >> /etc/sysctl.conf && \
    echo "precedence ::ffff:0:0/96 100" >> /etc/gai.conf

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run DB migrations then start the server. Use $PORT if provided, otherwise default to 7860.
# The migrations will only run if DATABASE_URL is set; the server starts regardless.
CMD ["sh", "-c", "[ -z \"$DATABASE_URL\" ] || alembic upgrade head; uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
