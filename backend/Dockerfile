# Used for deploying to Hugging Face Spaces (free, no card required).
# HF Spaces requires apps to listen on port 7860.
# Set DATABASE_URL, ALLOWED_ORIGINS, and DEBUG as Space Secrets.

FROM python:3.11-slim

WORKDIR /code

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 7860

# Run DB migrations then start the server
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 7860"]
