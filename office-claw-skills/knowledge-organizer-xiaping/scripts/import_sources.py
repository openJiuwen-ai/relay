from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .import_models import ImportDraft
from .import_normalizer import normalize_import_mapping
from .markdown_helpers import extract_title


def detect_source_type(url: str) -> str:
    """
    Classify web URLs into a small set of source types.

    Notes:
    - WeChat public-account articles (`mp.weixin.qq.com`) are tagged as `wechat_article`.
      Extraction details live in `references/wechat-import.md` (do not duplicate here).
    - Xiaohongshu note links (`xiaohongshu.com`, `xhslink.com`) are tagged as
      `xiaohongshu_note`. Extraction guidance lives in `references/xiaohongshu-import.md`.
    """
    raw = str(url or "").strip()
    if raw and "://" not in raw:
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    host = (parsed.netloc or "").lower()
    if not host and parsed.path:
        host = parsed.path.split("/", 1)[0].lower()
    if host.endswith("mp.weixin.qq.com"):
        return "wechat_article"
    if host.endswith("xiaohongshu.com") or host.endswith("xhslink.com"):
        return "xiaohongshu_note"
    return "web"


def load_link(url: str, *, title: str | None = None, content: str | None = None, **extra: Any) -> ImportDraft:
    payload: dict[str, Any] = {
        "title": title or "Untitled",
        "source_url": str(url or "").strip(),
        "content": content or "",
        **extra,
    }
    payload.setdefault("source_type", detect_source_type(payload["source_url"]))
    return normalize_import_mapping(payload)


def load_markdown_file(path: str | Path, **extra: Any) -> ImportDraft:
    md_path = Path(path)
    try:
        content = md_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        content = ""
    title = extract_title(content) or md_path.stem or "Untitled"

    payload: dict[str, Any] = {
        "title": title,
        "source_type": "markdown",
        "source_url": "",
        "source_path": str(md_path),
        "content": content,
        **extra,
    }
    return normalize_import_mapping(payload)


def load_folder(path: str | Path) -> list[ImportDraft]:
    root = Path(path)
    drafts: list[ImportDraft] = []
    if not root.exists():
        return drafts

    md_files: Iterable[Path] = sorted(p for p in root.rglob("*.md") if p.is_file())
    for md_path in md_files:
        draft = load_markdown_file(md_path)
        if draft.content == "" and md_path.exists() and md_path.stat().st_size > 0:
            continue
        drafts.append(draft)
    return drafts
