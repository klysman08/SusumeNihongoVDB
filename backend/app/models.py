from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Level = Literal["N5", "N4", "N3"]
SourceType = Literal["book", "manual"]
DocumentStatus = Literal["pending", "indexed", "failed"]
AnswerLanguage = Literal["auto", "ja", "en", "pt", "es", "fr"]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorResponse(BaseModel):
    code: str
    message: str
    request_id: str
    details: dict | list | None = None


class SearchRequest(StrictModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=10, ge=1, le=20)
    levels: list[Level] = Field(default_factory=list, max_length=3)
    tags: list[Tag] = Field(default_factory=list, max_length=20)
    source_types: list[SourceType] = Field(default_factory=list, max_length=2)

    @field_validator("query")
    @classmethod
    def query_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be blank")
        return value


class SearchResult(BaseModel):
    id: str
    document_id: str
    title: str
    text: str
    level: Level | None = None
    tags: list[str] = Field(default_factory=list)
    source_type: SourceType
    source_ref: str | None = None
    chapter: str | None = None
    section: str | None = None
    chunk_index: int
    score: float
    dense_score: float | None = None
    lexical_score: float | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


class AnswerRequest(StrictModel):
    question: str = Field(min_length=1, max_length=1000)
    language: AnswerLanguage = "auto"
    levels: list[Level] = Field(default_factory=list, max_length=3)
    tags: list[Tag] = Field(default_factory=list, max_length=20)
    source_types: list[SourceType] = Field(default_factory=list, max_length=2)

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question must not be blank")
        return value


class Citation(BaseModel):
    number: int
    document_id: str
    title: str
    source_ref: str | None = None
    chapter: str | None = None
    section: str | None = None
    excerpt: str


class AnswerResponse(BaseModel):
    question: str
    answer: str
    found: bool
    language: AnswerLanguage = "auto"
    citations: list[Citation] = Field(default_factory=list)


class SpeechRequest(StrictModel):
    input: str = Field(min_length=1, max_length=4000)
    language: Literal["ja", "en", "pt", "es", "fr"] = "ja"

    @field_validator("input")
    @classmethod
    def input_not_blank(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("input must not be blank")
        return value


class DocumentCreate(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=200_000)
    level: Level | None = None
    tags: list[Tag] = Field(default_factory=list, max_length=20)

    @field_validator("title", "content")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class DocumentUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1, max_length=200_000)
    level: Level | None = None
    tags: list[Tag] | None = Field(default=None, max_length=20)

    @field_validator("title", "content")
    @classmethod
    def not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must not be blank")
        return value.strip() if value is not None else None


class DocumentResponse(BaseModel):
    id: str
    title: str
    content: str
    level: Level | None = None
    tags: list[str]
    source_type: SourceType
    source_ref: str | None = None
    chapter: str | None = None
    content_hash: str
    status: DocumentStatus
    error: str | None = None
    created_at: datetime
    updated_at: datetime
    indexed_at: datetime | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    limit: int
    offset: int


class ReindexBookResponse(BaseModel):
    indexed: int
    skipped: int
    removed: int
    failed: int
