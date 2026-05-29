from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any
from collections.abc import Mapping


_WHITESPACE = re.compile(r"\s+")


def _one_line(value: Any) -> str:
    return _WHITESPACE.sub(" ", str(value or "")).strip()


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = [str(v) for v in value if v is not None and str(v).strip()]
    else:
        text = str(value).strip()
        items = [text] if text else []
    return [_one_line(item) for item in items if _one_line(item)]


def _as_any_list(value: Any) -> list[Any]:
    """
    Normalize optional "list-like" fields (e.g. images/attachments) into a list.

    Note: do NOT treat generic iterables as sequences here. A mapping should be
    kept as a single object rather than expanded to its keys.
    """

    if value is None:
        return []
    if isinstance(value, list):
        return list(value)
    return [value]


def _normalize_content_for_hash(content: str) -> str:
    text = str(content or "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Keep stable hashing across editors by trimming trailing whitespace/newlines.
    return "\n".join(line.rstrip() for line in text.split("\n")).rstrip()


def sha256_hex(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ImportDraft:
    """
    Normalized import representation shared across destinations.

    Keep this model small: adapters can carry platform-specific metadata in their
    own payload types without bloating the core import pipeline.
    """

    title: str
    source_type: str
    source_url: str
    content: str
    tags: list[str]
    images: list[Any]
    attachments: list[Any]
    source_id: str
    content_hash: str

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "ImportDraft":
        title = _one_line(data.get("title") or "Untitled") or "Untitled"
        source_type = _one_line(data.get("source_type") or "unknown").lower() or "unknown"
        source_url = _one_line(data.get("source_url") or data.get("url") or "")
        source_path = _one_line(
            data.get("source_path")
            or data.get("file_path")
            or data.get("path")
            or ""
        )
        explicit_source_id = _one_line(data.get("source_id") or "")
        content = str(
            data.get("content")
            or data.get("raw_content_markdown")
            or data.get("body")
            or ""
        )
        tags = _as_list(data.get("tags"))
        images = _as_any_list(data.get("images"))
        attachments = _as_any_list(data.get("attachments"))

        normalized_content = _normalize_content_for_hash(content)
        content_hash = sha256_hex(normalized_content)

        source_id_basis = explicit_source_id or source_url or source_path or f"{source_type}\n{title}"
        source_id = sha256_hex(source_id_basis)

        return cls(
            title=title,
            source_type=source_type,
            source_url=source_url,
            content=content,
            tags=tags,
            images=images,
            attachments=attachments,
            source_id=source_id,
            content_hash=content_hash,
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "source_type": self.source_type,
            "source_url": self.source_url,
            "content": self.content,
            "tags": list(self.tags),
            "images": list(self.images),
            "attachments": list(self.attachments),
            "source_id": self.source_id,
            "content_hash": self.content_hash,
        }
