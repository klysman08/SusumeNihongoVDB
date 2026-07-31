from __future__ import annotations

import argparse
import json
from pathlib import Path

from fastembed import SparseTextEmbedding, TextEmbedding
from .config import get_settings
from .repository import DocumentRepository
from .services import CatalogService, VectorIndex


def ingest() -> int:
    settings = get_settings()
    repository = DocumentRepository(settings.database_path)
    index = VectorIndex(settings)
    index.ensure_collection()
    result = CatalogService(repository, index).sync_book(settings.book_path)
    print(json.dumps(result.model_dump()))
    if result.failed:
        return 1
    settings.ingest_complete_file.parent.mkdir(parents=True, exist_ok=True)
    settings.ingest_complete_file.write_text("complete\n", encoding="utf-8")
    return 0


def download_models() -> int:
    settings = get_settings()
    settings.model_cache_path.mkdir(parents=True, exist_ok=True)
    list(
        TextEmbedding(
            model_name=settings.embedding_model,
            cache_dir=str(settings.model_cache_path),
        ).embed(["日本語 model warmup"])
    )
    list(
        SparseTextEmbedding(
            model_name=settings.sparse_model,
            cache_dir=str(settings.model_cache_path),
        ).embed(["日本語 model warmup"])
    )
    if not list(settings.model_cache_path.rglob("tokenizer.json")):
        raise RuntimeError("FastEmbed did not download tokenizer.json into the model cache")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("ingest", "download-models"))
    args = parser.parse_args()
    raise SystemExit(ingest() if args.command == "ingest" else download_models())


if __name__ == "__main__":
    main()
