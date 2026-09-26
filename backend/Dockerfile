# Bhoomi Backend — Dockerfile
# Multi-stage: builder installs deps; final image is slim and runs as non-root.

# ── Stage 1: dependency builder ────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools for psycopg2 and bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: production image ─────────────────────────────────────────────────
FROM python:3.12-slim AS final

# Security: run as non-root user (§9)
RUN groupadd --gid 1001 bhoomi \
    && useradd --uid 1001 --gid bhoomi --shell /bin/bash --create-home bhoomi

WORKDIR /app

# Bring in compiled deps from builder stage
COPY --from=builder /install /usr/local

# Install runtime-only native deps (libpq for psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY --chown=bhoomi:bhoomi . .

USER bhoomi

# Healthcheck (matched to /healthz endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"

EXPOSE 8000

# Gunicorn: 2 workers × (2×CPU+1) threads; adjust via env vars in prod.
CMD ["gunicorn", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "60", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "wsgi:application"]
