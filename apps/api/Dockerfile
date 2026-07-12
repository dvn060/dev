FROM python:3.12-slim

WORKDIR /app

# Install the application with the Batfish integration extra.
COPY pyproject.toml README.md* ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN pip install --no-cache-dir ".[batfish]"

ENV NE_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8000

# Apply migrations, then serve. The API binds to all container interfaces;
# docker-compose maps it to 127.0.0.1 on the host only.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
