from __future__ import annotations

import hashlib
import html
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

import yaml

POINT_NAMESPACE = uuid.UUID("4ab17ed5-959d-56bc-8f58-3190be4f694f")
BOOK_NAMESPACE = uuid.UUID("dc6dddb4-3c12-52a6-84d7-c03674415cc4")

_IMPORT_RE = re.compile(r"^\s*import\s+.+$", re.MULTILINE)
_HEADING_RE = re.compile(r"^(#{2,6})\s+(.+?)\s*$", re.MULTILINE)
_IMAGE_RE = re.compile(r"<BookImage\b.*?\s*/>", re.DOTALL)
_COMMENT_RE = re.compile(r"\{?/\*.*?\*/\}?", re.DOTALL)
_TAG_RE = re.compile(r"</?[A-Za-z][^>]*>", re.DOTALL)
_ATTR_RE = re.compile(
    r"([A-Za-z][\w-]*)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|\{(.*?)\})",
    re.DOTALL,
)
_STRING_RE = re.compile(r"(?:\"((?:\\.|[^\"\\])*)\"|'((?:\\.|[^'\\])*)')", re.DOTALL)
_IGNORED_ATTRIBUTES = {
    "client",
    "src",
    "width",
    "height",
    "accent",
    "locale",
    "romajimode",
}


@dataclass(frozen=True)
class NormalizedChapter:
    title: str
    level: str | None
    chapter: str | None
    tags: list[str]
    content: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class Chunk:
    index: int
    section: str
    text: str
    embedding_text: str
    token_count: int


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def book_document_id(source_ref: str) -> str:
    return str(uuid.uuid5(BOOK_NAMESPACE, source_ref))


def point_id(document_id: str, document_hash: str, chunk_index: int) -> str:
    return str(uuid.uuid5(POINT_NAMESPACE, f"{document_id}:{document_hash}:{chunk_index}"))


def _frontmatter(source: str) -> tuple[dict[str, Any], str]:
    if not source.startswith("---"):
        return {}, source
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", source, re.DOTALL)
    if not match:
        return {}, source
    parsed = yaml.safe_load(match.group(1)) or {}
    if not isinstance(parsed, dict):
        parsed = {}
    return parsed, source[match.end() :]


def _string_values(expression: str) -> list[str]:
    values: list[str] = []
    for match in _STRING_RE.finditer(expression):
        raw = match.group(1) if match.group(1) is not None else match.group(2)
        value = raw.replace(r"\n", " ").replace(r"\'", "'").replace(r'\"', '"').strip()
        if value and not value.startswith(("/book-images/", "../../", "@/")):
            values.append(value)
    return values


def _opening_tag_text(component: str, attributes: str) -> str:
    if component == "BookImage":
        return ""
    pieces: list[str] = []
    for attr in _ATTR_RE.finditer(attributes):
        name = attr.group(1)
        if name.lower() in _IGNORED_ATTRIBUTES or name.startswith("client"):
            continue
        if attr.group(2) is not None or attr.group(3) is not None:
            values = [(attr.group(2) if attr.group(2) is not None else attr.group(3)).strip()]
        else:
            values = _string_values(attr.group(4) or "")
        values = [value for value in values if value]
        if values:
            label = name.replace("Title", " title").replace("Time", " time").replace("-", " ")
            pieces.append(f"{label}: " + "; ".join(values))
    # Attribute expressions can contain nested arrays/objects that a regular expression
    # cannot balance. Preserve every quoted value, de-duplicating direct attributes above.
    seen_values = {piece.split(": ", 1)[-1] for piece in pieces}
    for value in _string_values(attributes):
        if value not in seen_values:
            pieces.append(value)
            seen_values.add(value)
    for fragment in re.findall(r"<>\s*(.*?)\s*</>", attributes, re.DOTALL):
        fragment = re.sub(r"<[^>]+>", "", fragment).strip()
        if fragment and fragment not in seen_values:
            pieces.append(fragment)
            seen_values.add(fragment)
    return ("\n" + "\n".join(pieces) + "\n") if pieces else "\n"


def _replace_component_tags(body: str) -> str:
    output: list[str] = []
    cursor = 0
    index = 0
    while index < len(body):
        match = re.match(r"<([A-Z][A-Za-z0-9.]*)\b", body[index:])
        if not match:
            index += 1
            continue
        component = match.group(1)
        attributes_start = index + match.end()
        position = attributes_start
        brace_depth = 0
        quote: str | None = None
        while position < len(body):
            char = body[position]
            if quote:
                if char == "\\":
                    position += 2
                    continue
                if char == quote:
                    quote = None
            elif char in {'"', "'", "`"}:
                quote = char
            elif char == "{":
                brace_depth += 1
            elif char == "}" and brace_depth:
                brace_depth -= 1
            elif char == ">" and brace_depth == 0:
                break
            position += 1
        if position >= len(body):
            index += 1
            continue
        output.append(body[cursor:index])
        output.append(_opening_tag_text(component, body[attributes_start:position]))
        cursor = position + 1
        index = cursor
    output.append(body[cursor:])
    return "".join(output)


def normalize_mdx(source: str, source_ref: str = "chapter.mdx") -> NormalizedChapter:
    metadata, body = _frontmatter(source)
    body = _IMPORT_RE.sub("", body)
    body = _COMMENT_RE.sub("", body)
    body = _IMAGE_RE.sub("", body)
    body = _replace_component_tags(body)
    body = body.replace("</>", "").replace("<>", "")
    body = _TAG_RE.sub("", body)
    body = re.sub(r"\{\s*\}", "", body)
    body = html.unescape(body)
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r"\n[ \t]+", "\n", body)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()

    chapter_value = metadata.get("chapter")
    if chapter_value is None:
        file_match = re.fullmatch(r"(\d{2})\.mdx", Path(source_ref).name)
        chapter_value = file_match.group(1) if file_match else None
    chapter = str(chapter_value).zfill(2) if chapter_value is not None else None
    level = str(metadata["level"]).upper() if metadata.get("level") else None
    title = str(metadata.get("title") or f"Chapter {chapter or ''}").strip()
    topics = metadata.get("topics")
    tags = [part.strip() for part in str(topics).split(",") if part.strip()] if topics else []

    prefix = [f"Title: {title}"]
    if level:
        prefix.append(f"JLPT level: {level}")
    if chapter:
        prefix.append(f"Chapter: {chapter}")
    if metadata.get("description"):
        prefix.append(f"Description: {metadata['description']}")
    content = "\n".join(prefix) + "\n\n" + body
    return NormalizedChapter(title, level, chapter, tags, content, metadata)


def _default_tokens(text: str) -> list[str]:
    return re.findall(r"[一-龯々〆ヵヶぁ-んァ-ヶー]+|[\w]+|[^\s]", text, re.UNICODE)


def chunk_document(
    content: str,
    *,
    title: str,
    level: str | None,
    max_tokens: int = 320,
    overlap_tokens: int = 48,
    tokenize: Callable[[str], list[str]] | None = None,
) -> list[Chunk]:
    if overlap_tokens >= max_tokens:
        raise ValueError("overlap_tokens must be smaller than max_tokens")
    tokenizer = tokenize or _default_tokens

    def split_to_limit(text: str) -> list[str]:
        remaining = text.strip()
        pieces: list[str] = []
        while remaining:
            if len(tokenizer(remaining)) <= max_tokens:
                pieces.append(remaining)
                break
            low, high, best = 1, len(remaining), 1
            while low <= high:
                middle = (low + high) // 2
                if len(tokenizer(remaining[:middle])) <= max_tokens:
                    best, low = middle, middle + 1
                else:
                    high = middle - 1
            cut = max(
                remaining.rfind(" ", 0, best),
                remaining.rfind("\n", 0, best),
                remaining.rfind("。", 0, best),
            )
            if cut < best // 2:
                cut = best
            else:
                cut += 1
            pieces.append(remaining[:cut].strip())
            remaining = remaining[cut:].strip()
        return pieces

    def token_tail(text: str, limit: int) -> str:
        if not limit or not text:
            return ""
        low, high, best = 0, len(text), len(text)
        while low <= high:
            middle = (low + high) // 2
            candidate = text[middle:]
            if len(tokenizer(candidate)) <= limit:
                best, high = middle, middle - 1
            else:
                low = middle + 1
        return text[best:].strip()

    matches = list(_HEADING_RE.finditer(content))
    sections: list[tuple[str, str]] = []
    first_end = matches[0].start() if matches else len(content)
    preamble = content[:first_end].strip()
    if preamble:
        sections.append(("Overview", preamble))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        sections.append((match.group(2).strip(), content[match.end() : end].strip()))

    chunks: list[Chunk] = []
    for section, section_text in sections:
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", section_text) if part.strip()]
        units: list[str] = []
        for paragraph in paragraphs:
            units.extend(split_to_limit(paragraph))

        current: list[str] = []
        current_tokens = 0
        previous_tail = ""
        for unit in units:
            unit_tokens = tokenizer(unit)
            if current and current_tokens + len(unit_tokens) > max_tokens:
                text = "\n\n".join(current)
                prefix = f"{title}\nJLPT: {level or 'Unspecified'}\nSection: {section}\n\n"
                chunks.append(Chunk(len(chunks), section, text, prefix + text, current_tokens))
                available_overlap = min(overlap_tokens, max_tokens - len(unit_tokens))
                previous_tail = token_tail(text, available_overlap)
                current = [previous_tail, unit] if previous_tail else [unit]
                current_tokens = len(tokenizer("\n\n".join(current)))
            else:
                current.append(unit)
                current_tokens += len(unit_tokens)
        if current:
            text = "\n\n".join(current)
            prefix = f"{title}\nJLPT: {level or 'Unspecified'}\nSection: {section}\n\n"
            chunks.append(Chunk(len(chunks), section, text, prefix + text, len(tokenizer(text))))
    return chunks


def numbered_book_files(book_path: Path) -> Iterable[Path]:
    for path in sorted(book_path.glob("*.mdx")):
        if re.fullmatch(r"\d{2}\.mdx", path.name):
            yield path
