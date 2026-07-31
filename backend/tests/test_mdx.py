from pathlib import Path

from app.mdx import book_document_id, chunk_document, content_hash, normalize_mdx, point_id


def test_normalize_frontmatter_and_jsx_values() -> None:
    source = """---
title: Chapter 07 — Test
level: n5
chapter: 7
topics: particles, travel
description: A useful chapter
---
import Thing from '../../Thing.tsx'
<BookImage src="/book-images/no.webp" alt="decorative" width={100} />
## Examples
<ExampleSentence client:load japanese="日本へ行きます。" romaji="Nihon e ikimasu." translation="I go to Japan." />
<QuizBlock questions={[{ question: "Which particle?", options: ["へ", "を"], explanation: "へ marks direction." }]} />
"""
    chapter = normalize_mdx(source, "book/07.mdx")
    assert chapter.title == "Chapter 07 — Test"
    assert chapter.level == "N5"
    assert chapter.chapter == "07"
    assert chapter.tags == ["particles", "travel"]
    assert "日本へ行きます。" in chapter.content
    assert "I go to Japan." in chapter.content
    assert "Which particle?" in chapter.content
    assert "へ marks direction." in chapter.content
    assert "import Thing" not in chapter.content
    assert "/book-images/" not in chapter.content


def test_real_chapter_normalization_excludes_image_paths() -> None:
    source = (Path(__file__).parents[2] / "book" / "01.mdx").read_text(encoding="utf-8")
    chapter = normalize_mdx(source, "book/01.mdx")
    assert "あき は きれいです。" in chapter.content
    assert "Autumn is beautiful." in chapter.content
    assert "book-images" not in chapter.content
    assert "Chapter: 01" in chapter.content


def test_nested_jsx_fragments_and_complete_arrays_are_preserved() -> None:
    source = (Path(__file__).parents[2] / "book" / "64.mdx").read_text(encoding="utf-8")
    chapter = normalize_mdx(source, "book/64.mdx")
    assert "市は昨年、駅周辺の交通を改善するために" in chapter.content
    assert "What remains undecided?" in chapter.content
    assert "ただし adds a restriction." in chapter.content
    assert "glossary={[" not in chapter.content
    assert "/>" not in chapter.content


def test_chunking_stays_in_sections_and_respects_overlap_and_limit() -> None:
    content = "## First\n\n" + " ".join(f"a{i}" for i in range(18)) + "\n\n## Second\n\n" + " ".join(
        f"b{i}" for i in range(18)
    )
    chunks = chunk_document(
        content,
        title="Title",
        level="N5",
        max_tokens=10,
        overlap_tokens=2,
        tokenize=lambda value: value.split(),
    )
    assert all(chunk.token_count <= 10 for chunk in chunks)
    assert {chunk.section for chunk in chunks} == {"First", "Second"}
    assert all(not ("a" in chunk.text and "b" in chunk.text) for chunk in chunks)
    first_chunks = [chunk for chunk in chunks if chunk.section == "First"]
    assert set(first_chunks[0].text.split()[-2:]) <= set(first_chunks[1].text.split())
    assert all("JLPT: N5" in chunk.embedding_text for chunk in chunks)


def test_hashes_and_ids_are_deterministic() -> None:
    assert content_hash("abc") == content_hash("abc")
    assert book_document_id("book/01.mdx") == book_document_id("book/01.mdx")
    assert point_id("doc", "hash", 2) == point_id("doc", "hash", 2)
    assert point_id("doc", "hash", 2) != point_id("doc", "hash", 3)
