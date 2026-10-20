"""Storage: JSON files by default, Supabase/Postgres when DATABASE_URL is set.

Both implementations expose the same four methods — ``read``, ``write``,
``update`` and ``append`` — so the services above never know which one is in
use. The Postgres side keeps one JSONB document per collection and takes a row
lock for a read-modify-write, which makes ``update`` atomic even when Render
runs more than one instance.

The table is created by ``supabase/migrations/20261020000000_mamyat.sql``; the
``ensure`` call is a convenience for a fresh database, not a replacement for
the migration.
"""
from __future__ import annotations

import copy
import os
import threading

from .store import JsonStore


def normalise_url(url: str) -> str:
    url = str(url or "").strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


_ENGINES: dict[str, object] = {}
_ENGINE_LOCK = threading.Lock()
_METADATA = None


def _metadata():
    global _METADATA
    if _METADATA is not None:
        return _METADATA
    from sqlalchemy import Column, DateTime, MetaData, Table, Text, func
    from sqlalchemy.dialects.postgresql import JSONB

    metadata = MetaData()
    Table(
        "mamyat_documents", metadata,
        Column("collection", Text, primary_key=True),
        Column("payload", JSONB, nullable=False),
        Column("updated_at", DateTime(timezone=True), server_default=func.now(),
               nullable=False),
    )
    _METADATA = metadata
    return metadata


def _engine(url: str):
    """One pool per URL, shared by every store in the process."""
    url = normalise_url(url)
    with _ENGINE_LOCK:
        engine = _ENGINES.get(url)
        if engine is None:
            from sqlalchemy import create_engine
            engine = create_engine(url, pool_pre_ping=True, pool_size=5,
                                   max_overflow=5, pool_recycle=1800)
            _ENGINES[url] = engine
        return engine


def _table():
    return _metadata().tables["mamyat_documents"]


class SqlStore:
    """The JsonStore interface over a JSONB row in Postgres."""

    def __init__(self, url: str, collection: str, default) -> None:
        self.engine = _engine(url)
        self.collection = str(collection)
        self._default = default if callable(default) else (lambda: copy.deepcopy(default))
        self.table = _table()
        self._ensure()

    def _ensure(self) -> None:
        _metadata().create_all(self.engine, checkfirst=True)

    def _read_conn(self, conn):
        from sqlalchemy import select
        return conn.execute(
            select(self.table.c.payload).where(
                self.table.c.collection == self.collection)).scalar_one_or_none()

    def read(self):
        from sqlalchemy import select
        with self.engine.connect() as conn:
            payload = self._read_conn(conn)
            if payload is None:
                self._insert_default(conn)
                conn.commit()
                payload = self._read_conn(conn)
            return copy.deepcopy(payload)

    def _insert_default(self, conn) -> None:
        from sqlalchemy.dialects.postgresql import insert
        conn.execute(insert(self.table).values(
            collection=self.collection, payload=self._default()
        ).on_conflict_do_nothing(index_elements=[self.table.c.collection]))

    def write(self, value):
        from sqlalchemy import func
        from sqlalchemy.dialects.postgresql import insert
        with self.engine.begin() as conn:
            statement = insert(self.table).values(
                collection=self.collection, payload=value)
            statement = statement.on_conflict_do_update(
                index_elements=[self.table.c.collection],
                set_={"payload": statement.excluded.payload,
                      "updated_at": func.now()})
            conn.execute(statement)
        return copy.deepcopy(value)

    def update(self, mutate):
        from sqlalchemy import func, select, update
        with self.engine.begin() as conn:
            payload = conn.execute(
                select(self.table.c.payload).where(
                    self.table.c.collection == self.collection
                ).with_for_update()).scalar_one_or_none()
            if payload is None:
                self._insert_default(conn)
                payload = conn.execute(
                    select(self.table.c.payload).where(
                        self.table.c.collection == self.collection
                    ).with_for_update()).scalar_one()
            value = copy.deepcopy(payload)
            result = mutate(value)
            conn.execute(update(self.table).where(
                self.table.c.collection == self.collection).values(
                payload=value, updated_at=func.now()))
            return copy.deepcopy(result)

    def append(self, row: dict) -> dict:
        def add(rows):
            rows.append(row)
            return row
        return self.update(add)

    def replace(self, predicate, replacement: dict) -> dict | None:
        def swap(rows):
            for index, row in enumerate(rows):
                if predicate(row):
                    rows[index] = replacement
                    return replacement
            return None
        return self.update(swap)

    def ping(self) -> bool:
        from sqlalchemy import text
        try:
            with self.engine.connect() as conn:
                conn.execute(text("select 1"))
            return True
        except Exception:
            return False


def make_store(collection: str, default, *, data_dir: str,
               database_url: str = ""):
    """Pick Postgres when a URL exists, JSON otherwise."""
    url = normalise_url(database_url)
    if url:
        return SqlStore(url, collection, default)
    return JsonStore(os.path.join(data_dir, collection + ".json"), default)
