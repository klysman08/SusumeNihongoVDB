from __future__ import annotations

import hmac
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.security import APIKeyHeader
from starlette.concurrency import run_in_threadpool

from .config import Settings, get_settings
from .errors import AppError
from .mdx import normalize_mdx
from .models import (
    AnswerRequest,
    AnswerResponse,
    DocumentCreate,
    DocumentListResponse,
    DocumentResponse,
    DocumentUpdate,
    ErrorResponse,
    ReindexBookResponse,
    SearchRequest,
    SearchResponse,
    SpeechRequest,
)
from .repository import DocumentRepository
from .services import AnswerService, CatalogService, SpeechService, VectorIndex

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger(__name__)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def create_app(
    settings: Settings | None = None,
    *,
    repository: DocumentRepository | None = None,
    index: VectorIndex | None = None,
    speech_service: SpeechService | None = None,
) -> FastAPI:
    configured = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        repo = repository or DocumentRepository(configured.database_path)
        vector_index = index or VectorIndex(configured)
        app.state.settings = configured
        app.state.repository = repo
        app.state.index = vector_index
        app.state.catalog = CatalogService(repo, vector_index)
        app.state.answers = AnswerService(configured, vector_index)
        app.state.speech = speech_service or SpeechService(configured)
        logger.info(
            "startup_complete environment=%s database=%s collection=%s",
            configured.environment,
            configured.database_path,
            configured.qdrant_collection,
        )
        yield

    app = FastAPI(
        title=configured.app_name,
        version="1.0.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
        responses={
            400: {"model": ErrorResponse},
            401: {"model": ErrorResponse},
            404: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
        },
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))[:128]
        request.state.request_id = request_id
        started = time.monotonic()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request method=%s path=%s status=%s duration_ms=%.1f request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            (time.monotonic() - started) * 1000,
            request_id,
        )
        return response

    def error_payload(request: Request, code: str, message: str, details=None) -> dict:
        return ErrorResponse(
            code=code,
            message=message,
            request_id=getattr(request.state, "request_id", "unknown"),
            details=details,
        ).model_dump(exclude_none=True)

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(request, exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=error_payload(request, "validation_error", "Request validation failed.", exc.errors()),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        logger.exception("unhandled_request_error")
        return JSONResponse(
            status_code=500,
            content=error_payload(request, "internal_error", "An unexpected error occurred."),
        )

    def repo(request: Request) -> DocumentRepository:
        return request.app.state.repository

    def catalog(request: Request) -> CatalogService:
        return request.app.state.catalog

    async def require_admin(
        request: Request,
        provided: str | None = Depends(api_key_header),
    ) -> None:
        expected = request.app.state.settings.admin_api_key.get_secret_value()
        if not provided or not hmac.compare_digest(
            provided.encode("utf-8"), expected.encode("utf-8")
        ):
            raise AppError("unauthorized", "A valid X-API-Key header is required.", status_code=401)

    @app.get("/api/health/live", tags=["health"])
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/health/ready", tags=["health"])
    async def ready(request: Request):
        settings_value: Settings = request.app.state.settings
        diagnostics: dict[str, str] = {"database": "unknown", "qdrant": "unknown", "ingest": "unknown"}
        try:
            await run_in_threadpool(request.app.state.repository.list, 1, 0)
            diagnostics["database"] = "ready"
            await run_in_threadpool(request.app.state.index.ping)
            diagnostics["qdrant"] = "ready"
            marker_ready = not settings_value.require_ingest_marker or settings_value.ingest_complete_file.exists()
            diagnostics["ingest"] = "ready" if marker_ready else "pending"
            if not marker_ready:
                raise RuntimeError("initial book ingestion has not completed")
            return {"status": "ready", "checks": diagnostics}
        except Exception as exc:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "not_ready",
                    "checks": diagnostics,
                    "message": str(exc),
                },
            )

    @app.post("/api/v1/search", response_model=SearchResponse, tags=["search"])
    async def search(request: Request, body: SearchRequest) -> SearchResponse:
        results = await run_in_threadpool(request.app.state.index.search, body)
        return SearchResponse(query=body.query, results=results)

    @app.post("/api/v1/answers", response_model=AnswerResponse, tags=["answers"])
    async def answers(request: Request, body: AnswerRequest) -> AnswerResponse:
        return await request.app.state.answers.answer(body)

    @app.post(
        "/api/v1/audio/speech",
        response_class=Response,
        responses={200: {"content": {"audio/mpeg": {}}}},
        tags=["audio"],
    )
    async def create_speech(request: Request, body: SpeechRequest) -> Response:
        audio = await request.app.state.speech.synthesize(body)
        headers = {
            "Cache-Control": "private, no-store",
            "Content-Disposition": 'inline; filename="susume-answer.mp3"',
        }
        if audio.generation_id:
            headers["X-Generation-ID"] = audio.generation_id
        return Response(content=audio.content, media_type=audio.media_type, headers=headers)

    @app.get("/api/v1/documents", response_model=DocumentListResponse, tags=["documents"])
    async def list_documents(
        repository_value: DocumentRepository = Depends(repo),
        limit: int = Query(default=20, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
    ) -> DocumentListResponse:
        items, total = await run_in_threadpool(repository_value.list, limit, offset)
        return DocumentListResponse(items=items, total=total, limit=limit, offset=offset)

    @app.get("/api/v1/documents/{document_id}", response_model=DocumentResponse, tags=["documents"])
    async def get_document(
        document_id: str, repository_value: DocumentRepository = Depends(repo)
    ) -> DocumentResponse:
        document = await run_in_threadpool(repository_value.get, document_id)
        if not document:
            raise AppError("not_found", "Document not found.", status_code=404)
        return document

    @app.post(
        "/api/v1/documents",
        response_model=DocumentResponse,
        status_code=201,
        dependencies=[Depends(require_admin)],
        tags=["documents"],
    )
    async def create_document(
        body: DocumentCreate,
        repository_value: DocumentRepository = Depends(repo),
        catalog_value: CatalogService = Depends(catalog),
    ) -> DocumentResponse:
        document = await run_in_threadpool(repository_value.create, body)
        return await run_in_threadpool(catalog_value.index_and_record, document)

    @app.post(
        "/api/v1/documents/upload",
        response_model=DocumentResponse,
        status_code=201,
        dependencies=[Depends(require_admin)],
        tags=["documents"],
    )
    async def upload_document(
        request: Request,
        file: UploadFile = File(...),
        level: str | None = Form(default=None),
        tags: str = Form(default=""),
        repository_value: DocumentRepository = Depends(repo),
        catalog_value: CatalogService = Depends(catalog),
    ) -> DocumentResponse:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in {".md", ".mdx", ".txt"}:
            raise AppError("unsupported_file", "Only .md, .mdx, and .txt files are accepted.")
        raw = await file.read(request.app.state.settings.upload_max_bytes + 1)
        if len(raw) > request.app.state.settings.upload_max_bytes:
            raise AppError("file_too_large", "The uploaded file exceeds 512 KiB.", status_code=413)
        try:
            decoded = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AppError("invalid_encoding", "The uploaded file must be UTF-8.") from exc
        if len(decoded) > request.app.state.settings.content_max_chars:
            raise AppError("content_too_large", "Decoded content exceeds 200,000 characters.", status_code=413)
        title = Path(file.filename or "Untitled").stem
        content = decoded.strip()
        if suffix == ".mdx":
            normalized = normalize_mdx(decoded, file.filename or "upload.mdx")
            title, content = normalized.title, normalized.content
        tag_values = [tag.strip() for tag in tags.split(",") if tag.strip()]
        try:
            data = DocumentCreate(title=title, content=content, level=level or None, tags=tag_values)
        except Exception as exc:
            raise AppError("validation_error", "Upload metadata is invalid.", details={"error": str(exc)}) from exc
        document = await run_in_threadpool(repository_value.create, data)
        return await run_in_threadpool(catalog_value.index_and_record, document)

    @app.patch(
        "/api/v1/documents/{document_id}",
        response_model=DocumentResponse,
        dependencies=[Depends(require_admin)],
        tags=["documents"],
    )
    async def update_document(
        document_id: str,
        body: DocumentUpdate,
        repository_value: DocumentRepository = Depends(repo),
        catalog_value: CatalogService = Depends(catalog),
    ) -> DocumentResponse:
        document = await run_in_threadpool(repository_value.update, document_id, body)
        if not document:
            raise AppError("not_found", "Document not found.", status_code=404)
        return await run_in_threadpool(catalog_value.index_and_record, document)

    @app.delete(
        "/api/v1/documents/{document_id}",
        status_code=204,
        dependencies=[Depends(require_admin)],
        tags=["documents"],
    )
    async def delete_document(document_id: str, catalog_value: CatalogService = Depends(catalog)) -> None:
        deleted = await run_in_threadpool(catalog_value.delete, document_id)
        if not deleted:
            raise AppError("not_found", "Document not found.", status_code=404)

    @app.post(
        "/api/v1/documents/{document_id}/reindex",
        response_model=DocumentResponse,
        dependencies=[Depends(require_admin)],
        tags=["documents"],
    )
    async def reindex_document(
        document_id: str,
        repository_value: DocumentRepository = Depends(repo),
        catalog_value: CatalogService = Depends(catalog),
    ) -> DocumentResponse:
        document = await run_in_threadpool(repository_value.get, document_id)
        if not document:
            raise AppError("not_found", "Document not found.", status_code=404)
        return await run_in_threadpool(catalog_value.index_and_record, document)

    @app.post(
        "/api/v1/admin/reindex-book",
        response_model=ReindexBookResponse,
        dependencies=[Depends(require_admin)],
        tags=["admin"],
    )
    async def reindex_book(request: Request, catalog_value: CatalogService = Depends(catalog)):
        return await run_in_threadpool(catalog_value.sync_book, request.app.state.settings.book_path)

    return app


app = create_app()
