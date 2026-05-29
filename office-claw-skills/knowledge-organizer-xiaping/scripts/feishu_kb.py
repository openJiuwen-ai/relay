from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from .import_models import ImportDraft
from .sync_state import SyncStateRecord


@dataclass(frozen=True)
class FeishuImportConfig:
    import_endpoint: str | None = None
    app_id: str | None = None
    app_secret: str | None = None
    access_token: str | None = None
    knowledge_base_id: str | None = None
    folder_id: str | None = None
    folder_token: str | None = None
    wiki_node: str | None = None
    wiki_space: str | None = None
    timeout: float = 30.0


@dataclass(frozen=True)
class FeishuImportResult:
    payload: dict[str, Any]
    response: dict[str, Any]
    remote_id: str | None
    remote_url: str | None
    sync_record: SyncStateRecord


def resolve_feishu_config(
    *,
    timeout: float = 30.0,
) -> FeishuImportConfig:
    return FeishuImportConfig(
        import_endpoint=os.environ.get("FEISHU_IMPORT_ENDPOINT", "").strip() or None,
        app_id=os.environ.get("FEISHU_APP_ID", "").strip() or None,
        app_secret=os.environ.get("FEISHU_APP_SECRET", "").strip() or None,
        access_token=os.environ.get("FEISHU_ACCESS_TOKEN", "").strip() or None,
        knowledge_base_id=os.environ.get("FEISHU_KB_ID", "").strip() or None,
        folder_id=os.environ.get("FEISHU_FOLDER_ID", "").strip() or None,
        folder_token=os.environ.get("FEISHU_FOLDER_TOKEN", "").strip() or None,
        wiki_node=os.environ.get("FEISHU_WIKI_NODE", "").strip() or None,
        wiki_space=os.environ.get("FEISHU_WIKI_SPACE", "").strip() or None,
        timeout=timeout,
    )


def _one_line(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _is_url_like(value: str) -> bool:
    return value.startswith(("http://", "https://"))


def _render_feishu_image(image: Any) -> str | None:
    if isinstance(image, str):
        target = image.strip()
        return f'<image url="{target}"/>' if _is_url_like(target) else (target or None)
    if not isinstance(image, dict):
        return _one_line(image) or None

    target = _one_line(
        image.get("src")
        or image.get("data_src")
        or image.get("data-src")
        or image.get("data-original")
        or image.get("data-lazy-src")
        or image.get("url")
        or image.get("image_url")
        or image.get("original")
    )
    if not target:
        target = _one_line(image.get("path"))
    if not target:
        return None

    label = _one_line(image.get("alt") or image.get("title") or "Image")
    if _is_url_like(target):
        caption = f' caption="{label}"' if label and label != "Image" else ""
        return f'<image url="{target}"{caption}/>'
    return f"- {label}: {target}"


def _render_feishu_attachment(attachment: Any) -> str | None:
    if isinstance(attachment, str):
        target = attachment.strip()
        return f'<file url="{target}" name="{target.rsplit("/", 1)[-1]}"/>' if _is_url_like(target) else (target or None)
    if not isinstance(attachment, dict):
        return _one_line(attachment) or None

    target = _one_line(attachment.get("url") or attachment.get("path") or attachment.get("href"))
    if not target:
        return None
    name = _one_line(attachment.get("name") or attachment.get("title") or target.rsplit("/", 1)[-1] or "Attachment")
    if _is_url_like(target):
        return f'<file url="{target}" name="{name}"/>'
    return f"- {name}: {target}"


def _markdown_body(draft: ImportDraft) -> str:
    lines = [
        f"**Source type:** {draft.source_type}",
    ]
    if draft.source_url:
        lines.append(f"**Source URL:** {draft.source_url}")
    lines.append(f"**Source ID:** {draft.source_id}")
    lines.append(f"**Content hash:** {draft.content_hash}")
    if draft.tags:
        lines.append(f"**Tags:** {', '.join(draft.tags)}")

    lines.extend(["", draft.content.strip(), ""])

    rendered_images = [_render_feishu_image(image) for image in draft.images]
    rendered_images = [line for line in rendered_images if line]
    if rendered_images:
        lines.extend(["## Images", ""])
        lines.extend(rendered_images)
        lines.append("")

    rendered_attachments = [_render_feishu_attachment(attachment) for attachment in draft.attachments]
    rendered_attachments = [line for line in rendered_attachments if line]
    if rendered_attachments:
        lines.extend(["## Attachments", ""])
        lines.extend(rendered_attachments)
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def _resolve_destination(
    *,
    wiki_node: str | None = None,
    wiki_space: str | None = None,
    folder_token: str | None = None,
    knowledge_base_id: str | None = None,
    folder_id: str | None = None,
) -> dict[str, str]:
    if wiki_node:
        return {"wiki_node": wiki_node}
    if wiki_space or knowledge_base_id:
        return {"wiki_space": wiki_space or knowledge_base_id or ""}
    if folder_token or folder_id:
        return {"folder_token": folder_token or folder_id or ""}
    return {}


def build_feishu_payload(
    draft: ImportDraft,
    *,
    folder_token: str | None = None,
    wiki_node: str | None = None,
    wiki_space: str | None = None,
    knowledge_base_id: str | None = None,
    folder_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": draft.title,
        "markdown": _markdown_body(draft),
    }
    payload.update(
        _resolve_destination(
            wiki_node=wiki_node,
            wiki_space=wiki_space,
            folder_token=folder_token,
            knowledge_base_id=knowledge_base_id,
            folder_id=folder_id,
        )
    )
    return payload


def _default_transport(payload: dict[str, Any], config: FeishuImportConfig) -> dict[str, Any]:
    raise RuntimeError("Feishu direct transport is provided by OpenClaw's openclaw-lark plugin; inject a transport callable in tests or integration code.")


def _extract_remote_fields(response: dict[str, Any]) -> tuple[str | None, str | None]:
    if not isinstance(response, dict):
        return (None, None)

    data = response.get("data") if isinstance(response.get("data"), dict) else response

    remote_id = data.get("doc_id") or data.get("docid") or data.get("document_id") or data.get("id")
    remote_url = data.get("doc_url") or data.get("url") or data.get("document_url")
    return (str(remote_id) if remote_id is not None else None, str(remote_url) if remote_url else None)


def import_to_feishu(
    draft: ImportDraft,
    config: FeishuImportConfig,
    *,
    transport: Callable[[dict[str, Any], FeishuImportConfig], dict[str, Any]] | None = None,
) -> FeishuImportResult:
    payload = build_feishu_payload(
        draft,
        folder_token=config.folder_token,
        wiki_node=config.wiki_node,
        wiki_space=config.wiki_space,
        knowledge_base_id=config.knowledge_base_id,
        folder_id=config.folder_id,
    )
    response = (transport or _default_transport)(payload, config)
    remote_id, remote_url = _extract_remote_fields(response)
    now = datetime.now(timezone.utc).isoformat()
    sync_record = SyncStateRecord(
        source_id=draft.source_id,
        content_hash=draft.content_hash,
        destination="feishu",
        remote_id=remote_id,
        remote_url=remote_url,
        last_synced_at=now,
        status="ok",
        error_message=None,
    )
    return FeishuImportResult(
        payload=payload,
        response=response,
        remote_id=remote_id,
        remote_url=remote_url,
        sync_record=sync_record,
    )
