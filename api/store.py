"""Small JSON stores with one lock and atomic writes.

A shop on a free Render instance can live on JSON/JSONL until Postgres is
configured (decision 0007). Every store here is read-modify-write under a
single process lock and replaces the file atomically, so a crash mid-write
cannot leave half an order on disk.
"""
from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
from typing import Any, Callable


class StoreError(RuntimeError):
    """The store cannot be read or written."""


def _default_factory(default: Any):
    if callable(default):
        return default
    return lambda: copy.deepcopy(default)


class JsonStore:
    """A list or dict persisted as one JSON file."""

    def __init__(self, path: str, default: Any) -> None:
        self.path = path
        self._lock = threading.RLock()
        self._default = _default_factory(default)
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        if not os.path.exists(path):
            self._write(self._default())

    def _read(self) -> Any:
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError:
            return self._default()
        except (OSError, ValueError) as exc:
            raise StoreError(f"não foi possível ler {os.path.basename(self.path)}") from exc

    def _write(self, value: Any) -> None:
        directory = os.path.dirname(self.path) or "."
        os.makedirs(directory, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=directory, delete=False,
            prefix=".tmp-", suffix=".json")
        try:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        finally:
            handle.close()
        os.replace(handle.name, self.path)

    # -- public ------------------------------------------------------
    def read(self) -> Any:
        with self._lock:
            return copy.deepcopy(self._read())

    def write(self, value: Any) -> Any:
        with self._lock:
            self._write(value)
            return copy.deepcopy(value)

    def update(self, mutate: Callable[[Any], Any]) -> Any:
        """Run ``mutate(value)`` under the lock and persist the same object."""
        with self._lock:
            value = self._read()
            result = mutate(value)
            self._write(value)
            return copy.deepcopy(result)

    def append(self, row: dict) -> dict:
        def add(rows):
            rows.append(row)
            return row
        return self.update(add)

    def replace(self, predicate: Callable[[dict], bool],
                replacement: dict) -> dict | None:
        def swap(rows):
            for index, row in enumerate(rows):
                if predicate(row):
                    rows[index] = replacement
                    return replacement
            return None
        return self.update(swap)


def now_iso(clock=None) -> str:
    from datetime import datetime, timezone
    instant = clock() if clock else datetime.now(timezone.utc)
    return instant.astimezone(timezone.utc).isoformat(timespec="seconds")


def atomic_id(prefix: str) -> str:
    import secrets
    return f"{prefix}_{secrets.token_urlsafe(9).replace('-', '').replace('_', '')}"
