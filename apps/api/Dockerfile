FROM python:3.12-slim

WORKDIR /app

# Corporate TLS-inspection proxies: drop your proxy's CA certificate(s) as
# .crt files into apps/api/build-cas/ before building (kept out of git).
# The directory ships empty; this layer is a no-op in the normal case.
COPY build-cas/ /usr/local/share/ca-certificates/extra/
RUN update-ca-certificates
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# Install the application with the Batfish integration extra.
COPY pyproject.toml ./
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
