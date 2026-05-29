from __future__ import annotations

import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Callable

import yaml

FRONTMATTER_BOUNDARY = "---"


def _normalize_to_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return [str(value)]


def _split_frontmatter(content: str) -> tuple[str | None, str]:
    lines = content.splitlines(keepends=True)
    if not lines or lines[0].strip() != FRONTMATTER_BOUNDARY:
        return None, content

    for index in range(1, len(lines)):
        if lines[index].strip() == FRONTMATTER_BOUNDARY:
            frontmatter = "".join(lines[1:index])
            remainder = "".join(lines[index + 1 :])
            return frontmatter, remainder

    return None, content


def strip_frontmatter(content: str) -> str:
    _, remainder = _split_frontmatter(content)
    return remainder.strip()


def load_frontmatter(content: str, *, on_error: Callable[[yaml.YAMLError], None] | None = None) -> dict[str, Any]:
    raw_frontmatter, _ = _split_frontmatter(content)
    if raw_frontmatter is None:
        return {}

    try:
        parsed = yaml.safe_load(raw_frontmatter)
    except yaml.YAMLError as exc:
        if on_error:
            on_error(exc)
        return {}

    return parsed if isinstance(parsed, dict) else {}


def extract_title(content: str) -> str:
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return ""


def similarity(text1: str, text2: str) -> float:
    return SequenceMatcher(None, text1, text2).ratio()


def scan_knowledge_base(kb_path: str) -> list[dict[str, Any]]:
    articles: list[dict[str, Any]] = []
    kb_dir = Path(kb_path)

    if not kb_dir.exists():
        return articles

    for md_file in kb_dir.rglob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            print(f"Error reading {md_file}: {exc}", file=sys.stderr)
            continue

        frontmatter = load_frontmatter(
            content,
            on_error=lambda exc, path=md_file: print(
                f"Error parsing frontmatter for {path}: {exc}", file=sys.stderr
            ),
        )

        tags = _normalize_to_list(frontmatter.get("tags"))
        keywords = _normalize_to_list(frontmatter.get("keywords"))

        articles.append(
            {
                "path": str(md_file),
                "relative_path": str(md_file.relative_to(kb_dir)),
                "title": extract_title(content),
                "content": content,
                "tags": tags,
                "keywords": keywords,
            }
        )

    return articles
