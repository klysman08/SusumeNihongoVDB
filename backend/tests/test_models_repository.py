from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models import DocumentCreate, DocumentUpdate, SearchRequest
from app.repository import DocumentRepository


def test_request_validation_limits() -> None:
    with pytest.raises(ValidationError):
        SearchRequest(query="x" * 1001)
    with pytest.raises(ValidationError):
        SearchRequest(query="ok", top_k=21)
    with pytest.raises(ValidationError):
        DocumentCreate(title="t", content="c", tags=[str(index) for index in range(21)])


def test_repository_create_update_and_status(tmp_path: Path) -> None:
    repo = DocumentRepository(tmp_path / "documents.sqlite3")
    created = repo.create(DocumentCreate(title="Manual", content="初めまして", level="N5", tags=["intro"]))
    assert created.status == "pending"
    repo.mark_indexed(created.id)
    assert repo.get(created.id).status == "indexed"  # type: ignore[union-attr]
    updated = repo.update(created.id, DocumentUpdate(content="よろしくお願いします"))
    assert updated is not None
    assert updated.status == "pending"
    assert updated.content_hash != created.content_hash
    repo.mark_failed(created.id, "qdrant unavailable")
    assert repo.get(created.id).status == "failed"  # type: ignore[union-attr]
    assert repo.delete(created.id)


def test_book_upsert_skips_unchanged_and_manual_is_untouched(tmp_path: Path) -> None:
    repo = DocumentRepository(tmp_path / "documents.sqlite3")
    manual = repo.create(DocumentCreate(title="Manual", content="Custom"))
    first, changed = repo.upsert_book(
        document_id="book-id",
        title="Chapter",
        content="Text",
        level="N5",
        tags=[],
        source_ref="book/01.mdx",
        chapter="01",
    )
    assert changed
    second, changed = repo.upsert_book(
        document_id="book-id",
        title="Chapter",
        content="Text",
        level="N5",
        tags=[],
        source_ref="book/01.mdx",
        chapter="01",
    )
    assert not changed
    assert second.id == first.id
    assert repo.get(manual.id) is not None

