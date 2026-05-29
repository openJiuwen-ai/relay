from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable
from urllib import error, request

from .import_models import ImportDraft
from .sync_state import SyncStateRecord


@dataclass(frozen=True)
class ImaImportConfig:
    """
    Tencent IMA OpenAPI config.

    Docs (OpenClaw reference): https://ima.qq.com/openapi/note/v1
    """

    base_url: str = "https://ima.qq.com/openapi/note/v1"
    client_id: str | None = None
    api_key: str | None = None
    folder_id: str | None = None
    timeout: float = 30.0


@dataclass(frozen=True)
class ImaImportResult:
    payload: dict[str, Any]
    response: dict[str, Any]
    remote_id: str | None
    remote_url: str | None
    sync_record: SyncStateRecord


def resolve_ima_config(
    *,
    base_url: str | None = None,
    timeout: float = 30.0,
) -> ImaImportConfig:
    return ImaImportConfig(
        base_url=(base_url or os.environ.get("IMA_OPENAPI_BASE_URL", "")).strip()
        or "https://ima.qq.com/openapi/note/v1",
        client_id=os.environ.get("IMA_OPENAPI_CLIENTID", "").strip() or None,
        api_key=os.environ.get("IMA_OPENAPI_APIKEY", "").strip() or None,
        folder_id=os.environ.get("IMA_OPENAPI_FOLDER_ID", "").strip() or None,
        timeout=timeout,
    )


def _one_line(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _markdown_body(draft: ImportDraft) -> str:
    lines: list[str] = [
        f"# {draft.title}",
        "",
        f"- Source type: {draft.source_type}",
    ]
    if draft.source_url:
        lines.append(f"- Source URL: {draft.source_url}")
    lines.extend(
        [
            f"- Source ID: {draft.source_id}",
            f"- Content hash: {draft.content_hash}",
        ]
    )
    if draft.tags:
        lines.append(f"- Tags: {', '.join(draft.tags)}")

    lines.extend(["", draft.content.strip(), ""])

    if draft.images:
        lines.extend(["## Images", ""])
        for image in draft.images:
            if isinstance(image, str):
                target = image.strip()
                if target:
                    lines.append(f"- {target}")
                continue
            if isinstance(image, dict):
                label = _one_line(image.get("alt") or image.get("title") or "Image")
                target = _one_line(
                    image.get("src")
                    or image.get("data_src")
                    or image.get("data-src")
                    or image.get("url")
                    or image.get("image_url")
                    or image.get("original")
                    or image.get("path")
                )
                if target:
                    lines.append(f"- {label}: {target}")
                continue
            lines.append(f"- {_one_line(image)}")
        lines.append("")

    if draft.attachments:
        lines.extend(["## Attachments", ""])
        for att in draft.attachments:
            if isinstance(att, str):
                target = att.strip()
                if target:
                    lines.append(f"- {target}")
                continue
            if isinstance(att, dict):
                name = _one_line(att.get("name") or att.get("title") or "Attachment")
                target = _one_line(att.get("url") or att.get("path") or att.get("href"))
                if target:
                    lines.append(f"- {name}: {target}")
                continue
            lines.append(f"- {_one_line(att)}")
        lines.append("")

    return "\n".join(line for line in lines if line is not None).strip() + "\n"


def build_ima_payload(
    draft: ImportDraft,
    *,
    folder_id: str | None = None,
) -> dict[str, Any]:
    """
    Build an IMA OpenAPI `import_doc` request payload.

    Keep this payload conservative: only include documented fields to avoid
    relying on any undocumented server-side tolerance.
    """

    payload: dict[str, Any] = {
        "content_format": 1,  # Markdown
        "content": _markdown_body(draft),
    }
    if folder_id:
        payload["folder_id"] = folder_id
    return payload


def _default_transport(payload: dict[str, Any], config: ImaImportConfig) -> dict[str, Any]:
    if not config.client_id or not config.api_key:
        raise ValueError("IMA client_id/api_key are required (IMA_OPENAPI_CLIENTID/IMA_OPENAPI_APIKEY)")

    url = f"{config.base_url.rstrip('/')}/import_doc"
    headers = {
        "Content-Type": "application/json",
        "ima-openapi-clientid": config.client_id,
        "ima-openapi-apikey": config.api_key,
    }

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=body, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=config.timeout) as resp:
            raw = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        raise RuntimeError(f"IMA import failed with HTTP {exc.code}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"IMA import failed: {exc.reason}") from exc

    if not raw.strip():
        return {}
    return json.loads(raw)


def _extract_remote_fields(response: dict[str, Any]) -> tuple[str | None, str | None]:
    if not isinstance(response, dict):
        return (None, None)

    # Most likely: {"doc_id": "..."} or {"data": {"doc_id": "..."}}.
    doc_id = response.get("doc_id")
    data = response.get("data")
    if doc_id is None and isinstance(data, dict):
        doc_id = data.get("doc_id") or data.get("docid")
    if doc_id is None:
        doc_id = response.get("docid")

    return (str(doc_id) if doc_id is not None else None, None)


def _raise_for_application_error(response: dict[str, Any]) -> None:
    if not isinstance(response, dict):
        return

    code = response.get("code")
    if code is None:
        data = response.get("data")
        if isinstance(data, dict):
            code = data.get("code")
    if code is None:
        return

    code_text = str(code).strip()
    if code_text and code_text != "0":
        message = response.get("msg") or response.get("message")
        if message is None:
            data = response.get("data")
            if isinstance(data, dict):
                message = data.get("msg") or data.get("message")
        detail = f": {message}" if message else ""
        raise RuntimeError(f"IMA import failed with API code {code_text}{detail}")


def import_to_ima(
    draft: ImportDraft,
    config: ImaImportConfig,
    *,
    transport: Callable[[dict[str, Any], ImaImportConfig], dict[str, Any]] | None = None,
) -> ImaImportResult:
    payload = build_ima_payload(draft, folder_id=config.folder_id)
    response = (transport or _default_transport)(payload, config)
    _raise_for_application_error(response)
    remote_id, remote_url = _extract_remote_fields(response)
    now = datetime.now(timezone.utc).isoformat()
    sync_record = SyncStateRecord(
        source_id=draft.source_id,
        content_hash=draft.content_hash,
        destination="ima",
        remote_id=remote_id,
        remote_url=remote_url,
        last_synced_at=now,
        status="ok",
        error_message=None,
    )
    return ImaImportResult(
        payload=payload,
        response=response,
        remote_id=remote_id,
        remote_url=remote_url,
        sync_record=sync_record,
    )
