# ─────────────────────────────────────────────────────────────────────────────
# WheatGuard AI – Backend Dockerfile
# Multi-stage build: builder → runtime
# CPU-only. For GPU support, change the base image to pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# System dependencies needed to compile some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements first to leverage layer caching
COPY requirements.txt .

# Install into a prefix so we can copy to runtime stage
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

LABEL maintainer="WheatGuard AI"
LABEL description="AI-Powered Wheat Disease Detection API"

WORKDIR /app

# Runtime system dependencies for OpenCV and libGL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# Create directories that must exist at runtime
RUN mkdir -p \
    models/checkpoints \
    data/raw \
    data/processed \
    artifacts/plots \
    artifacts/reports \
    artifacts/gradcam \
    logs

# Non-root user for security
RUN useradd --no-create-home --shell /bin/false appuser \
    && chown -R appuser:appuser /app
USER appuser

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
    || exit 1

# Start the FastAPI server
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--log-level", "info"]
