from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Susume Nihongo Knowledge API"
    environment: str = "production"
    admin_api_key: SecretStr = SecretStr("change-me")
    database_path: Path = Path("/data/documents.sqlite3")
    book_path: Path = Path("/book")
    ingest_complete_file: Path = Path("/data/.book_ingest_complete")
    require_ingest_marker: bool = True

    qdrant_url: str = "http://qdrant:6333"
    qdrant_api_key: SecretStr | None = None
    qdrant_collection: str = "susume_knowledge_v1"
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    sparse_model: str = "Qdrant/bm25"
    model_cache_path: Path = Path("/models")
    dense_dimension: int = 384
    dense_relevance_floor: float = Field(default=0.25, ge=0, le=1)
    max_chunk_tokens: int = Field(default=320, ge=64, le=1024)
    chunk_overlap_tokens: int = Field(default=48, ge=0, le=256)

    llm_provider: Literal["openrouter", "compatible"] = "compatible"

    # OpenRouter is configured separately so its key never needs to be reused as
    # a generic gateway credential. The base URL includes /v1, matching the
    # official OpenRouter API and SDK configuration.
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_api_key: SecretStr | None = None
    openrouter_model: str = ""
    openrouter_http_referer: str | None = None
    openrouter_app_title: str = "Susume Nihongo"

    # Fallback for Ollama and any other OpenAI-compatible gateway.
    llm_base_url: str = "http://host.docker.internal:11434"
    llm_model: str = ""
    llm_api_key: SecretStr | None = None
    llm_connect_timeout: float = 5.0
    llm_read_timeout: float = 45.0

    upload_max_bytes: int = 512 * 1024
    content_max_chars: int = 200_000


@lru_cache
def get_settings() -> Settings:
    return Settings()
