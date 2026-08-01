# Susume Nihongo Vector Knowledge App

A single-host, Dockerized Japanese-learning knowledge app. It indexes the 64 numbered chapters in [`book/`](book/) with local multilingual dense embeddings and BM25 sparse vectors, serves hybrid search through FastAPI, and generates citation-validated answers through OpenRouter or another OpenAI-compatible Chat Completions gateway.

SQLite is the durable catalog and source of truth for content added through the API. Qdrant is a rebuildable search index. The original book files are mounted read-only and are never changed by the web app.

For the complete indexing, retrieval, security, dashboard, and recovery design, see [`Qdrant.md`](Qdrant.md).

## Start the stack

Requirements: Docker Engine with Compose v2 and enough disk for the application images, Qdrant data, and approximately 250 MB of baked embedding assets.

```bash
cp .env.example .env
# Set independent, random ADMIN_API_KEY and QDRANT_API_KEY values in .env.
# Set OPENROUTER_API_KEY. Answer and speech generation share this server-side key.
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:8080/api/health/ready
```

Open <http://localhost:8080>. FastAPI remains private. The authenticated Qdrant dashboard is bound to the host loopback interface at <http://localhost:6333/dashboard>, so it is available from this machine but not published to the LAN.

The first build downloads the configured FastEmbed dense and sparse models into the backend image. Runtime startup does not need model-network access. The one-shot `ingest` service waits for Qdrant, synchronizes exactly `book/[0-9][0-9].mdx`, and must finish before the backend and frontend become ready.

## OpenRouter model selection

The example environment uses [OpenRouter's Chat Completions API](https://openrouter.ai/docs/quickstart). Create an API key, put it only in the server-side `.env`, and choose any model slug from the [OpenRouter model catalog](https://openrouter.ai/models):

```dotenv
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=~anthropic/claude-sonnet-latest
OPENROUTER_TTS_MODEL=hexgrad/kokoro-82m
OPENROUTER_TTS_JAPANESE_VOICE=jf_alpha
OPENROUTER_TTS_ENGLISH_VOICE=af_heart
OPENROUTER_TTS_PORTUGUESE_VOICE=pf_dora
OPENROUTER_TTS_SPANISH_VOICE=ef_dora
OPENROUTER_TTS_FRENCH_VOICE=ff_siwis
```

After changing models, recreate only the backend (no reindex or frontend rebuild is needed):

```bash
docker compose up -d --force-recreate backend
```

`OPENROUTER_TTS_MODEL` configures the model used by the answer card's Listen action. Japanese, English, Portuguese, Spanish, and French answers use separately configurable voices. The backend requests MP3 from [OpenRouter's Audio Speech API](https://openrouter.ai/docs/guides/overview/multimodal/tts), and the browser only receives the generated audio—the OpenRouter key is never included in the browser bundle.

Before asking, users can choose Automatic, Japanese, English, Portuguese, Spanish, or French as the answer language. Kokoro uses a matching native voice for each explicit choice. The browser keeps up to 30 answers and 50 generated audio clips in IndexedDB; replaying cached speech does not call OpenRouter again. Users can delete individual answers or clear all local history and audio from the History dialog.

`OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_TITLE` enable OpenRouter's optional app attribution headers. Leave the referer blank for a private/local installation.

To use a local or different compatible gateway instead, set `LLM_PROVIDER=compatible` and configure `LLM_BASE_URL`, `LLM_MODEL`, and optional `LLM_API_KEY`.

## API examples

Search is public:

```bash
curl -sS http://localhost:8080/api/v1/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"What is the difference between は and が?","top_k":5,"levels":["N5"]}'
```

Grounded answers are public but require the server-side LLM configuration:

```bash
curl -sS http://localhost:8080/api/v1/answers \
  -H 'Content-Type: application/json' \
  -d '{"question":"『はずだ』はいつ使いますか？","levels":["N3"]}'
```

Speech generation is public, rate-limited at the edge, and requires the server-side OpenRouter configuration:

```bash
curl -sS http://localhost:8080/api/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"input":"『はずだ』は予想や確信を表します。","language":"ja"}' \
  --output answer.mp3
```

Mutations require the administrator key:

```bash
curl -sS http://localhost:8080/api/v1/documents \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Counter notes","content":"本を二冊買いました。","level":"N5","tags":["counters"]}'

curl -sS http://localhost:8080/api/v1/documents/upload \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -F 'file=@notes.md' -F 'level=N4' -F 'tags=review,vocabulary'
```

Interactive API docs are at <http://localhost:8080/api/docs>; the versioned OpenAPI document is at `/api/openapi.json`.

## Reindexing and diagnostics

Book synchronization is idempotent by normalized content hash. Changed and new chapters are reindexed, missing book chapters are removed, and API-added manual documents are not touched.

```bash
curl -sS -X POST http://localhost:8080/api/v1/admin/reindex-book \
  -H "X-API-Key: $ADMIN_API_KEY"

docker compose logs ingest backend qdrant
docker compose run --rm ingest
```

A failed document remains in SQLite with `status: "failed"` and its error. Retry it with `POST /api/v1/documents/{id}/reindex`. A dense dimension or named-vector mismatch intentionally fails instead of silently modifying `susume_knowledge_v1`; change the collection version and migrate explicitly when changing models or vector schema.

The edge permits 60 search requests/minute/IP with a small burst and 10 answer requests/minute/IP with a burst of two. Uploads are limited to `.md`, `.mdx`, or `.txt`, 512 KiB, UTF-8, and 200,000 decoded characters.

## Backup and restore

The critical backup is the `catalog-data` volume because it contains `/data/documents.sqlite3`, including all API-added content. Stop writes briefly for a consistent raw SQLite copy:

```bash
docker compose stop ingest backend
docker run --rm -v susume-nihongo_catalog-data:/source:ro -v "$PWD/backups:/backup" alpine \
  cp /source/documents.sqlite3 /backup/documents.sqlite3
docker compose start backend
```

Retain `qdrant-data` as well for fast recovery. Qdrant can be rebuilt from the book plus SQLite, but preserving it avoids a full embedding pass.

Restore into a stopped stack by placing `documents.sqlite3` back into the `catalog-data` volume, then start Qdrant and run `docker compose run --rm ingest` before starting the backend. If Qdrant data is unavailable, remove only the Qdrant volume after verifying the SQLite backup, start Qdrant, and run the ingest job plus reindex any manual documents whose status is not indexed.

## Development and verification

```bash
cd backend
uv sync --all-groups
uv run pytest -q

cd ../frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

With the Docker stack running, the opt-in live Qdrant suite can be executed from the baked backend image without publishing Qdrant:

```bash
docker run --rm --network susume-nihongo_private \
  -e RUN_QDRANT_INTEGRATION=1 -e QDRANT_URL=http://qdrant:6333 \
  -e QDRANT_API_KEY="$QDRANT_API_KEY" -e MODEL_CACHE_PATH=/models \
  -v "$PWD/backend/tests:/integration:ro" \
  susume-nihongo-backend python /integration/test_qdrant_integration.py
```

The API uses structured request logs and returns an `X-Request-ID` header. Errors share the shape `{ code, message, request_id, details? }`. Retrieved passages are treated as untrusted data, model outputs must contain valid supplied-source markers, and malformed citations are retried once before an error is returned.
