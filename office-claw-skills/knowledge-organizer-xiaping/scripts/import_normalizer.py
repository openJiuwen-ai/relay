from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .import_models import ImportDraft


def normalize_import_mapping(data: Mapping[str, Any]) -> ImportDraft:
    """
    Normalize an arbitrary mapping into the shared ImportDraft.

    This is intentionally thin: it only ensures a sensible `source_type` default
    based on URL patterns (WeChat / Xiaohongshu / generic web) and then defers to
    ImportDraft for field normalization + hashing.
    """
    payload = dict(data)
    if not (payload.get("source_type") or "").strip():
        url = str(payload.get("source_url") or payload.get("url") or "").strip()
        if url:
            # Local import to avoid import cycles with `import_sources`.
            from .import_sources import detect_source_type

            payload["source_type"] = detect_source_type(url)
    return ImportDraft.from_mapping(payload)
