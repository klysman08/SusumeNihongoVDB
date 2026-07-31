from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .mdx import content_hash
from .models import DocumentCreate, DocumentResponse, DocumentUpdate


def _now() -> str:
    return datetime.now(UTC).isoformat()


class DocumentRepository:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    level TEXT,
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    source_type TEXT NOT NULL CHECK(source_type IN ('book','manual')),
                    source_ref TEXT UNIQUE,
                    chapter TEXT,
                    content_hash TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('pending','indexed','failed')),
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    indexed_at TEXT
                )
                """
            )
            db.execute("CREATE INDEX IF NOT EXISTS ix_documents_source_type ON documents(source_type)")
            db.execute("CREATE INDEX IF NOT EXISTS ix_documents_status ON documents(status)")

    @staticmethod
    def _response(row: sqlite3.Row) -> DocumentResponse:
        return DocumentResponse(
            **{key: row[key] for key in row.keys() if key != "tags_json"},
            tags=json.loads(row["tags_json"]),
        )

    def get(self, document_id: str) -> DocumentResponse | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        return self._response(row) if row else None

    def get_by_source_ref(self, source_ref: str) -> DocumentResponse | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM documents WHERE source_ref = ?", (source_ref,)).fetchone()
        return self._response(row) if row else None

    def list(self, limit: int, offset: int) -> tuple[list[DocumentResponse], int]:
        with self.connect() as db:
            total = int(db.execute("SELECT COUNT(*) FROM documents").fetchone()[0])
            rows = db.execute(
                "SELECT * FROM documents ORDER BY updated_at DESC LIMIT ? OFFSET ?", (limit, offset)
            ).fetchall()
        return [self._response(row) for row in rows], total

    def list_by_source_type(self, source_type: str) -> list[DocumentResponse]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM documents WHERE source_type = ?", (source_type,)).fetchall()
        return [self._response(row) for row in rows]

    def create(self, data: DocumentCreate) -> DocumentResponse:
        document_id = str(uuid.uuid4())
        now = _now()
        with self._lock, self.connect() as db:
            db.execute(
                """INSERT INTO documents
                (id,title,content,level,tags_json,source_type,source_ref,chapter,content_hash,status,error,created_at,updated_at,indexed_at)
                VALUES (?,?,?,?,?,'manual',NULL,NULL,?,'pending',NULL,?,?,NULL)""",
                (
                    document_id,
                    data.title,
                    data.content,
                    data.level,
                    json.dumps(data.tags, ensure_ascii=False),
                    content_hash(data.content),
                    now,
                    now,
                ),
            )
        return self.get(document_id)  # type: ignore[return-value]

    def upsert_book(
        self,
        *,
        document_id: str,
        title: str,
        content: str,
        level: str | None,
        tags: list[str],
        source_ref: str,
        chapter: str | None,
    ) -> tuple[DocumentResponse, bool]:
        digest = content_hash(content)
        existing = self.get_by_source_ref(source_ref)
        if existing and existing.content_hash == digest:
            return existing, False
        now = _now()
        created_at = existing.created_at.isoformat() if existing else now
        with self._lock, self.connect() as db:
            db.execute(
                """INSERT INTO documents
                (id,title,content,level,tags_json,source_type,source_ref,chapter,content_hash,status,error,created_at,updated_at,indexed_at)
                VALUES (?,?,?,?,?,'book',?,?,?,'pending',NULL,?,?,NULL)
                ON CONFLICT(source_ref) DO UPDATE SET
                  title=excluded.title, content=excluded.content, level=excluded.level,
                  tags_json=excluded.tags_json, chapter=excluded.chapter,
                  content_hash=excluded.content_hash, status='pending', error=NULL,
                  updated_at=excluded.updated_at, indexed_at=NULL""",
                (
                    document_id,
                    title,
                    content,
                    level,
                    json.dumps(tags, ensure_ascii=False),
                    source_ref,
                    chapter,
                    digest,
                    created_at,
                    now,
                ),
            )
        return self.get_by_source_ref(source_ref), True  # type: ignore[return-value]

    def update(self, document_id: str, data: DocumentUpdate) -> DocumentResponse | None:
        existing = self.get(document_id)
        if not existing:
            return None
        values = data.model_dump(exclude_unset=True)
        title = values.get("title", existing.title)
        content = values.get("content", existing.content)
        level = values.get("level", existing.level)
        tags = values.get("tags", existing.tags)
        with self._lock, self.connect() as db:
            db.execute(
                """UPDATE documents SET title=?,content=?,level=?,tags_json=?,content_hash=?,
                status='pending',error=NULL,updated_at=?,indexed_at=NULL WHERE id=?""",
                (
                    title,
                    content,
                    level,
                    json.dumps(tags, ensure_ascii=False),
                    content_hash(content),
                    _now(),
                    document_id,
                ),
            )
        return self.get(document_id)

    def mark_indexed(self, document_id: str) -> None:
        now = _now()
        with self.connect() as db:
            db.execute(
                "UPDATE documents SET status='indexed',error=NULL,indexed_at=?,updated_at=? WHERE id=?",
                (now, now, document_id),
            )

    def mark_failed(self, document_id: str, error: str) -> None:
        with self.connect() as db:
            db.execute(
                "UPDATE documents SET status='failed',error=?,updated_at=? WHERE id=?",
                (error[:2000], _now(), document_id),
            )

    def delete(self, document_id: str) -> bool:
        with self._lock, self.connect() as db:
            cursor = db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        return cursor.rowcount > 0

