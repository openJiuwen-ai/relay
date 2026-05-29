from __future__ import annotations

import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any


_REMOTE_URL_RE = re.compile(r"^https?://", flags=re.IGNORECASE)


def normalize_one_line(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def stringify_target(value: Any) -> str:
    return normalize_one_line(str(value or ""))


def looks_remote(target: str) -> bool:
    return bool(_REMOTE_URL_RE.match(target))


def first_field(image: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = stringify_target(image.get(key))
        if value:
            return value
    return ""


def first_srcset_candidate(srcset: str) -> str:
    best_url = ""
    best_score = -1.0
    for candidate in srcset.split(","):
        candidate = candidate.strip()
        if not candidate:
            continue
        parts = candidate.split()
        if not parts:
            continue
        url = parts[0].strip()
        descriptor = parts[1] if len(parts) > 1 else ""
        score = 0.0
        match = re.fullmatch(r"(\d+(?:\.\d+)?)(x|w)", descriptor)
        if match:
            value = float(match.group(1))
            unit = match.group(2)
            score = value if unit == "x" else value
        if score > best_score:
            best_score = score
            best_url = url
    return best_url


def resolve_image_targets(image: Any) -> tuple[str, str, str]:
    if isinstance(image, str):
        target = stringify_target(image)
        if not target:
            return "", "", "Image"
        if looks_remote(target):
            return "", target, "Image"
        return target, "", Path(target).stem or "Image"

    if not isinstance(image, Mapping):
        return "", "", "Image"

    local_target = first_field(
        image,
        ("path", "local_path", "file", "target"),
    )
    remote_target = first_field(
        image,
        (
            "src",
            "data_src",
            "data-src",
            "dataSrc",
            "data-original",
            "data_original",
            "dataOriginal",
            "data-lazy-src",
            "data_lazy_src",
            "dataLazySrc",
            "url",
            "source_url",
            "source-url",
            "sourceUrl",
            "image_url",
            "image-url",
            "imageUrl",
            "original",
            "original_url",
            "original-url",
            "originalUrl",
        ),
    )
    if not remote_target:
        remote_target = first_srcset_candidate(
            stringify_target(
                image.get("srcset")
                or image.get("data_srcset")
                or image.get("data-srcset")
                or image.get("dataSrcset")
            )
        )
    label = stringify_target(image.get("alt") or image.get("title") or Path(local_target or remote_target).stem)
    return local_target, remote_target, label or "Image"
