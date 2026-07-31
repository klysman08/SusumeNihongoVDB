FROM ghcr.io/astral-sh/uv:0.11.6 AS uv

FROM python:3.13.11-slim AS builder
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    MODEL_CACHE_PATH=/models
WORKDIR /app
COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
RUN mkdir -p /models && .venv/bin/python -c "from fastembed import TextEmbedding, SparseTextEmbedding; list(TextEmbedding(model_name='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', cache_dir='/models').embed(['日本語 model warmup'])); list(SparseTextEmbedding(model_name='Qdrant/bm25', cache_dir='/models').embed(['日本語 model warmup']))"
COPY app ./app
RUN uv sync --locked --no-dev

FROM python:3.13.11-slim AS runtime
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MODEL_CACHE_PATH=/models
WORKDIR /app
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app \
    && mkdir -p /data /models && chown -R app:app /app /data /models
COPY --from=builder --chown=app:app /app /app
COPY --from=builder --chown=app:app /models /models
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
