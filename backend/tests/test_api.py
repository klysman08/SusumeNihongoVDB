from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import SearchResult
from app.repository import DocumentRepository


class FakeIndex:
    def __init__(self) -> None:
        self.documents: dict[str, object] = {}
        self.fail = False

    def ping(self) -> bool:
        return True

    def index_document(self, document) -> int:
        if self.fail:
            raise RuntimeError("index offline")
        self.documents[document.id] = document
        return 1

    def delete_document(self, document_id: str) -> None:
        self.documents.pop(document_id, None)

    def search(self, request):
        return []

    def has_evidence(self, results, query=None) -> bool:
        return bool(results)


def client(tmp_path: Path, index: FakeIndex | None = None) -> TestClient:
    settings = Settings(
        admin_api_key="secret",
        database_path=tmp_path / "db.sqlite3",
        book_path=tmp_path / "book",
        require_ingest_marker=False,
        llm_model="test",
    )
    repo = DocumentRepository(settings.database_path)
    return TestClient(create_app(settings, repository=repo, index=index or FakeIndex()))


def test_api_key_and_document_lifecycle(tmp_path: Path) -> None:
    with client(tmp_path) as api:
        rejected = api.post("/api/v1/documents", json={"title": "T", "content": "C"})
        assert rejected.status_code == 401
        assert rejected.json()["code"] == "unauthorized"
        created = api.post(
            "/api/v1/documents",
            headers={"X-API-Key": "secret"},
            json={"title": "T", "content": "日本語", "level": "N5", "tags": ["new"]},
        )
        assert created.status_code == 201
        payload = created.json()
        assert payload["status"] == "indexed"
        assert api.get(f"/api/v1/documents/{payload['id']}").status_code == 200
        listing = api.get("/api/v1/documents").json()
        assert listing["total"] == 1
        patched = api.patch(
            f"/api/v1/documents/{payload['id']}",
            headers={"X-API-Key": "secret"},
            json={"content": "更新"},
        )
        assert patched.status_code == 200
        assert patched.json()["content"] == "更新"
        deleted = api.delete(
            f"/api/v1/documents/{payload['id']}", headers={"X-API-Key": "secret"}
        )
        assert deleted.status_code == 204


def test_upload_rejections_and_utf8(tmp_path: Path) -> None:
    with client(tmp_path) as api:
        headers = {"X-API-Key": "secret"}
        assert (
            api.post(
                "/api/v1/documents/upload",
                headers=headers,
                files={"file": ("bad.pdf", b"pdf", "application/pdf")},
            ).status_code
            == 400
        )
        invalid = api.post(
            "/api/v1/documents/upload",
            headers=headers,
            files={"file": ("bad.txt", b"\xff", "text/plain")},
        )
        assert invalid.json()["code"] == "invalid_encoding"
        valid = api.post(
            "/api/v1/documents/upload",
            headers=headers,
            files={"file": ("notes.md", "猫です".encode(), "text/markdown")},
            data={"level": "N4", "tags": "review,vocabulary"},
        )
        assert valid.status_code == 201
        assert valid.json()["level"] == "N4"
        assert valid.json()["tags"] == ["review", "vocabulary"]


def test_failed_index_is_recorded_for_retry(tmp_path: Path) -> None:
    index = FakeIndex()
    index.fail = True
    with client(tmp_path, index) as api:
        response = api.post(
            "/api/v1/documents",
            headers={"X-API-Key": "secret"},
            json={"title": "T", "content": "C"},
        )
        assert response.status_code == 503
        item = api.get("/api/v1/documents").json()["items"][0]
        assert item["status"] == "failed"
        index.fail = False
        retried = api.post(
            f"/api/v1/documents/{item['id']}/reindex", headers={"X-API-Key": "secret"}
        )
        assert retried.status_code == 200
        assert retried.json()["status"] == "indexed"


def test_openapi_has_api_key_scheme(tmp_path: Path) -> None:
    with client(tmp_path) as api:
        schema = api.get("/api/openapi.json").json()
        scheme = schema["components"]["securitySchemes"]["APIKeyHeader"]
        assert scheme == {"type": "apiKey", "in": "header", "name": "X-API-Key"}
