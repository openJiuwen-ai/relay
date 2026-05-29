from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Callable, Iterable

from .feishu_kb import FeishuImportConfig, import_to_feishu
from .ima_kb import ImaImportConfig, import_to_ima
from .import_models import ImportDraft
from .import_sources import load_folder, load_link, load_markdown_file
from .obsidian_note import render_obsidian_note, sanitize_filename
from .settings import resolve_vault_root
from .sync_state import SyncStateRecord, SyncStateStore


@dataclass(frozen=True)
class SyncItemResult:
    source_id: str
    title: str
    destination: str
    status: str
    action: str
    remote_id: str | None = None
    remote_url: str | None = None
    message: str | None = None


@dataclass(frozen=True)
class SyncRunResult:
    destination: str
    mode: str
    processed: int
    skipped: int
    dry_run: bool
    items: list[SyncItemResult]


def _build_draft_collection(
    *,
    drafts: Iterable[ImportDraft] | None = None,
    link: str | None = None,
    markdown_path: str | Path | None = None,
    folder_path: str | Path | None = None,
) -> list[ImportDraft]:
    collected: list[ImportDraft] = list(drafts or [])
    if link:
        collected.append(load_link(link))
    if markdown_path:
        collected.append(load_markdown_file(markdown_path))
    if folder_path:
        collected.extend(load_folder(folder_path))
    return collected


def _dedupe_drafts(drafts: Iterable[ImportDraft]) -> tuple[list[ImportDraft], int]:
    seen: set[tuple[str, str]] = set()
    unique: list[ImportDraft] = []
    skipped = 0
    for draft in drafts:
        key = (draft.source_id, draft.content_hash)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        unique.append(draft)
    return unique, skipped


def _should_skip_sync(
    *,
    store: SyncStateStore,
    destination: str,
    draft: ImportDraft,
    mode: str,
) -> bool:
    if mode != "sync":
        return False
    existing = store.read(destination=destination, source_id=draft.source_id)
    return bool(existing and existing.content_hash == draft.content_hash)


def _write_obsidian_note(
    draft: ImportDraft,
    *,
    vault_root: str | Path,
    dry_run: bool,
) -> tuple[Path, str]:
    if dry_run:
        root = Path(vault_root).expanduser()
        return root / f"{sanitize_filename(draft.title)}.md", ""

    def _fail_download(_url: str, _destination: Path) -> None:
        raise RuntimeError("dry-run image download disabled")

    rendered = render_obsidian_note(
        draft.to_mapping(),
        vault_root=vault_root,
        download_image=_fail_download if dry_run else None,
    )
    if not dry_run:
        rendered.destination_path.parent.mkdir(parents=True, exist_ok=True)
        rendered.destination_path.write_text(rendered.content, encoding="utf-8")
    return rendered.destination_path, rendered.content


def _make_feishu_config(overrides: dict[str, Any] | None) -> FeishuImportConfig:
    return FeishuImportConfig(**(overrides or {}))


def _make_ima_config(overrides: dict[str, Any] | None) -> ImaImportConfig:
    return ImaImportConfig(**(overrides or {}))


def _normalize_disabled_destinations(values: Iterable[str] | None) -> set[str]:
    disabled: set[str] = set()
    for value in values or []:
        for item in str(value).split(","):
            item = item.strip().lower()
            if item:
                disabled.add(item)
    return disabled


def run_sync(
    *,
    destination: str,
    mode: str,
    state_path: str | Path,
    drafts: Iterable[ImportDraft] | None = None,
    link: str | None = None,
    markdown_path: str | Path | None = None,
    folder_path: str | Path | None = None,
    vault_root: str | Path | None = None,
    dry_run: bool = False,
    disabled_destinations: Iterable[str] | None = None,
    feishu_config_overrides: dict[str, Any] | None = None,
    ima_config_overrides: dict[str, Any] | None = None,
    feishu_transport: Callable[[dict[str, Any], FeishuImportConfig], dict[str, Any]] | None = None,
    ima_transport: Callable[[dict[str, Any], ImaImportConfig], dict[str, Any]] | None = None,
) -> SyncRunResult:
    destination = (destination or "").strip().lower()
    mode = (mode or "").strip().lower()
    if destination not in {"obsidian", "feishu", "ima"}:
        raise ValueError(f"Unsupported destination: {destination}")
    if mode not in {"once", "sync"}:
        raise ValueError(f"Unsupported mode: {mode}")
    disabled = _normalize_disabled_destinations(disabled_destinations)
    if destination in disabled:
        raise ValueError(f"Destination is disabled: {destination}")

    store = SyncStateStore(state_path)
    collected = _build_draft_collection(
        drafts=drafts,
        link=link,
        markdown_path=markdown_path,
        folder_path=folder_path,
    )
    collected, duplicate_skipped = _dedupe_drafts(collected)
    results: list[SyncItemResult] = []
    processed = 0
    skipped = duplicate_skipped
    resolved_vault_root = resolve_vault_root(vault_root) if destination == "obsidian" else None

    for draft in collected:
        if _should_skip_sync(store=store, destination=destination, draft=draft, mode=mode):
            skipped += 1
            results.append(
                SyncItemResult(
                    source_id=draft.source_id,
                    title=draft.title,
                    destination=destination,
                    status="skipped",
                    action="unchanged",
                    message="content_hash unchanged",
                )
            )
            continue

        processed += 1
        if destination == "obsidian":
            if resolved_vault_root is None:
                raise ValueError("vault_root is required for Obsidian destination")
            note_path, _content = _write_obsidian_note(draft, vault_root=resolved_vault_root, dry_run=dry_run)
            remote_id = str(note_path)
            remote_url = None
            status = "preview" if dry_run else "ok"
            action = "write" if not dry_run else "preview"
        elif destination == "feishu":
            config = _make_feishu_config(feishu_config_overrides)
            if dry_run:
                remote_id = None
                remote_url = None
                status = "preview"
                action = "preview"
            else:
                result = import_to_feishu(draft, config, transport=feishu_transport)
                remote_id = result.remote_id
                remote_url = result.remote_url
                status = result.sync_record.status
                action = "import"
        else:
            config = _make_ima_config(ima_config_overrides)
            if dry_run:
                remote_id = None
                remote_url = None
                status = "preview"
                action = "preview"
            else:
                result = import_to_ima(draft, config, transport=ima_transport)
                remote_id = result.remote_id
                remote_url = result.remote_url
                status = result.sync_record.status
                action = "import"

        sync_record = SyncStateRecord(
            source_id=draft.source_id,
            content_hash=draft.content_hash,
            destination=destination,
            remote_id=remote_id,
            remote_url=remote_url,
            last_synced_at=datetime.now(timezone.utc).isoformat(),
            status=status,
            error_message=None,
        )
        if not dry_run:
            store.write(sync_record)
        results.append(
            SyncItemResult(
                source_id=draft.source_id,
                title=draft.title,
                destination=destination,
                status=status,
                action=action,
                remote_id=remote_id,
                remote_url=remote_url,
            )
        )

    return SyncRunResult(
        destination=destination,
        mode=mode,
        processed=processed,
        skipped=skipped,
        dry_run=dry_run,
        items=results,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Knowledge sync orchestrator")
    parser.add_argument("--destination", required=True, choices=["obsidian", "feishu", "ima"])
    parser.add_argument("--mode", required=True, choices=["once", "sync"])
    parser.add_argument("--state", required=True, help="Sync state JSON path")
    parser.add_argument("--vault-root", help="Obsidian vault root (required for obsidian)")
    parser.add_argument("--link", help="Single link source")
    parser.add_argument("--markdown-path", help="Markdown file source")
    parser.add_argument("--folder-path", help="Folder source")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--disable",
        action="append",
        default=[],
        help="Disable one or more destinations (comma-separated or repeated).",
    )

    args = parser.parse_args(argv)
    try:
        result = run_sync(
            destination=args.destination,
            mode=args.mode,
            state_path=args.state,
            vault_root=args.vault_root,
            link=args.link,
            markdown_path=args.markdown_path,
            folder_path=args.folder_path,
            dry_run=args.dry_run,
            disabled_destinations=args.disable,
        )
    except ValueError as exc:
        print(str(exc))
        return 1
    print(
        {
            "destination": result.destination,
            "mode": result.mode,
            "processed": result.processed,
            "skipped": result.skipped,
            "dry_run": result.dry_run,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
