FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    RETRIEVAL_BACKEND=moss \
    RETRIEVAL_DATA_DIR=/app/retrieval/.data

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv

WORKDIR /app
COPY retrieval/pyproject.toml retrieval/uv.lock /app/retrieval/
RUN cd retrieval && uv sync --frozen --no-dev
# Copy only source files: local credentials, native caches and SQLite files are
# never copied into this image, even when building from the local checkout.
COPY retrieval/*.py /app/retrieval/
COPY datagen/*.py /app/datagen/
RUN python /app/datagen/generate.py --out /app/datagen/seed.json

WORKDIR /app/retrieval
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
