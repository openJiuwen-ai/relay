from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Iterable

import yaml

from .image_fields import resolve_image_targets
from .image_assets import render_image_markdown

FRONTMATTER_BOUNDARY = "---"


@dataclass(frozen=True)
class RenderedNote:
    content: str
    destination_path: Path


def wikilink(target: str) -> str:
    """Return a wiki-style link without relying on plugins."""
    return f"[[{target}]]"


def embed(target: str) -> str:
    """Return an embed without relying on plugins."""
    return f"![[{target}]]"


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v is not None and str(v).strip()]
    text = str(value).strip()
    return [text] if text else []


def _escape_markdown_label(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def _normalize_image_target(value: Any) -> str:
    return normalize_one_line(str(value or ""))


def _render_image_reference(image: Any) -> str | None:
    if isinstance(image, str):
        target = _normalize_image_target(image)
        if not target:
            return None
        if re.match(r"^https?://", target, flags=re.IGNORECASE):
            return f"![Image](<{target}>)"
        return embed(target)

    if not isinstance(image, Mapping):
        return None

    local_target, remote_target, _ = resolve_image_targets(image)
    label = _normalize_image_target(image.get("alt") or image.get("title") or "Image")

    if local_target:
        return embed(local_target)
    if remote_target:
        return f"![{_escape_markdown_label(label)}](<{remote_target}>)"
    return None


_INVALID_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|]')


def sanitize_filename(title: str, *, max_len: int = 120) -> str:
    # Obsidian is generally permissive, but we must avoid path separators and
    # characters that are problematic across filesystems.
    cleaned = _INVALID_FILENAME_CHARS.sub("-", (title or "").strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip().rstrip(".")
    if not cleaned:
        cleaned = "Untitled"
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip()
    return cleaned


def canonical_hash(*, title: str, source_type: str, source_url: str, published: str) -> str:
    payload = "\n".join(
        [
            (title or "").strip(),
            (source_type or "").strip().lower(),
            (source_url or "").strip(),
            (published or "").strip(),
        ]
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _dump_frontmatter(data: Mapping[str, Any]) -> str:
    # Keep YAML human-readable and stable for Obsidian.
    raw = yaml.safe_dump(
        dict(data),
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    ).strip()
    return f"{FRONTMATTER_BOUNDARY}\n{raw}\n{FRONTMATTER_BOUNDARY}\n"


def _iter_lines(text: str) -> Iterable[str]:
    for line in (text or "").splitlines():
        yield line.rstrip("\n")


def normalize_one_line(text: str) -> str:
    """Collapse internal newlines/whitespace to a single publishable line."""
    return re.sub(r"\s+", " ", (text or "")).strip()


def render_obsidian_note(
    draft: Mapping[str, Any],
    *,
    vault_root: str | Path,
    download_image=None,
) -> RenderedNote:
    """
    Runtime contract:
    - input: structured draft + target vault root
    - output: fully publishable Obsidian Markdown and a resolved destination path
    - caller responsibility: perform the actual file write (no IO here)
    """
    title = normalize_one_line(str(draft.get("title") or "Untitled")) or "Untitled"
    aliases = _as_list(draft.get("aliases"))
    tags = _as_list(draft.get("tags"))
    source_type = str(draft.get("source_type") or "").strip() or "unknown"
    source_url = str(draft.get("source_url") or "").strip()
    published = str(draft.get("published") or "").strip()
    today = date.today().isoformat()
    created = str(draft.get("created") or "").strip() or today
    updated = str(draft.get("updated") or "").strip() or today
    importance = str(draft.get("importance") or "").strip() or "reference"
    status = str(draft.get("status") or "").strip() or "draft"

    digest = canonical_hash(
        title=title, source_type=source_type, source_url=source_url, published=published
    )

    frontmatter = {
        "title": title,
        "aliases": aliases,
        "tags": tags,
        "source_type": source_type,
        "source_url": source_url,
        "published": published,
        "created": created,
        "updated": updated,
        "importance": importance,
        "status": status,
        "canonical_hash": digest,
    }

    summary = normalize_one_line(str(draft.get("summary") or ""))
    bullets = _as_list(draft.get("bullets"))
    excerpts = _as_list(draft.get("excerpts"))
    related_notes = _as_list(draft.get("related_notes"))
    embeds = set(_as_list(draft.get("embeds")))
    related_links = draft.get("related_links") or []
    images = draft.get("images") or []

    body_lines: list[str] = []
    body_lines.append(f"# {title}")
    body_lines.append("")
    if summary:
        body_lines.append(summary)
        body_lines.append("")

    if bullets:
        body_lines.append("## Key Points")
        body_lines.append("")
        body_lines.extend(f"- {normalize_one_line(point)}" for point in bullets)
        body_lines.append("")

    if excerpts:
        body_lines.append("## Evidence")
        body_lines.append("")
        for idx, excerpt in enumerate(excerpts, start=1):
            suffix = "" if idx == 1 else f"-{idx}"
            block_id = f"^evidence-{digest[:8]}{suffix}"
            excerpt_lines = list(_iter_lines(excerpt))
            if not excerpt_lines:
                continue
            for line_idx, line in enumerate(excerpt_lines):
                is_last = line_idx == len(excerpt_lines) - 1
                tail = f" {block_id}" if is_last else ""
                body_lines.append(f"> {line}{tail}")
            body_lines.append("")

    if related_notes:
        body_lines.append("## Related Notes")
        body_lines.append("")
        for note in related_notes:
            rendered = embed(note) if note in embeds else wikilink(note)
            body_lines.append(f"- {rendered}")
        body_lines.append("")

    rendered_links: list[str] = []
    if isinstance(related_links, list):
        for item in related_links:
            if not isinstance(item, Mapping):
                continue
            note_target = item.get("note")
            if note_target:
                rendered_links.append(f"- {wikilink(str(note_target))}")
                continue
            url = item.get("url")
            if url:
                label = normalize_one_line(str(item.get("title") or url))
                rendered_links.append(
                    f"- [{_escape_markdown_label(label)}](<{str(url).strip()}>)"
                )

    if rendered_links:
        body_lines.append("## Related Links")
        body_lines.append("")
        body_lines.extend(rendered_links)
        body_lines.append("")

    rendered_images: list[str] = []
    if isinstance(images, list):
        for item in images:
            rendered = render_image_markdown(
                item,
                vault_root=vault_root,
                note_title=title,
                download_image=download_image,
            )
            if rendered:
                rendered_images.append(rendered)

    if rendered_images:
        body_lines.append("## Images")
        body_lines.append("")
        body_lines.extend(f"- {line}" for line in rendered_images)
        body_lines.append("")

    body_lines.append("## Source")
    body_lines.append("")
    if source_url:
        body_lines.append(f"- [Source](<{source_url}>)")
    else:
        body_lines.append("- Source: (missing)")
    if source_type:
        body_lines.append(f"- Type: {source_type}")
    if published:
        body_lines.append(f"- Published: {published}")
    body_lines.append("")

    content = _dump_frontmatter(frontmatter) + "\n".join(body_lines).rstrip() + "\n"

    vault_root_text = str(vault_root).strip()
    if not vault_root_text:
        raise ValueError("vault_root must be a non-empty absolute path")

    root = Path(vault_root_text).expanduser()
    if not root.is_absolute():
        raise ValueError("vault_root must be an absolute path")
    root = root.resolve()
    filename = sanitize_filename(title) + ".md"
    destination = root / filename
    return RenderedNote(content=content, destination_path=destination)
