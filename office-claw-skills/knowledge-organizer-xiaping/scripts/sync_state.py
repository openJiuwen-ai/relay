from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SyncStateRecord:
    source_id: str
    content_hash: str
    destination: str
    remote_id: str | None
    remote_url: str | None
    last_synced_at: str
    status: str
    error_message: str | None

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "SyncStateRecord":
        return cls(
            source_id=str(data.get("source_id") or ""),
            content_hash=str(data.get("content_hash") or ""),
            destination=str(data.get("destination") or ""),
            remote_id=data.get("remote_id"),
            remote_url=data.get("remote_url"),
            last_synced_at=str(data.get("last_synced_at") or ""),
            status=str(data.get("status") or ""),
            error_message=data.get("error_message"),
        )


class SyncStateStore:
    """
    JSON-backed sync state store.

    This keeps the persistent format intentionally simple so it can be inspected
    and edited by humans if needed.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._records: dict[str, SyncStateRecord] = {}
        self._load_if_exists()

    @staticmethod
    def _key(*, destination: str, source_id: str) -> str:
        return f"{(destination or '').strip().lower()}::{(source_id or '').strip()}"

    def _load_if_exists(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError:
            return
        records = raw.get("records") or {}
        if not isinstance(records, dict):
            return
        for key, value in records.items():
            if not isinstance(value, dict):
                continue
            record = SyncStateRecord.from_mapping(value)
            self._records[str(key)] = record

    def _dump(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "records": {k: asdict(v) for k, v in self._records.items()},
        }

    def _flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(self._dump(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        tmp.replace(self.path)

    def write(self, record: SyncStateRecord) -> None:
        key = self._key(destination=record.destination, source_id=record.source_id)
        self._records[key] = record
        self._flush()

    def read(self, *, destination: str, source_id: str) -> SyncStateRecord | None:
        return self._records.get(self._key(destination=destination, source_id=source_id))

    def all_records(self, *, destination: str | None = None) -> list[SyncStateRecord]:
        if destination is None:
            return list(self._records.values())
        prefix = f"{(destination or '').strip().lower()}::"
        return [v for k, v in self._records.items() if k.startswith(prefix)]
