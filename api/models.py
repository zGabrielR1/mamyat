"""SQLAlchemy metadata for the Supabase table the backend writes.

The application keeps one JSONB document per collection (decision 0007); this
module is the single place that shape is declared for Python tooling and tests.
The SQL migration under ``supabase/migrations`` must stay in sync.
"""
from __future__ import annotations

try:  # SQLAlchemy is optional in JSON-only development.
    from sqlalchemy import Column, DateTime, MetaData, Table, Text, func
    from sqlalchemy.dialects.postgresql import JSONB

    metadata = MetaData()

    documents = Table(
        "mamyat_documents", metadata,
        Column("collection", Text, primary_key=True),
        Column("payload", JSONB, nullable=False),
        Column("updated_at", DateTime(timezone=True), server_default=func.now(),
               nullable=False),
    )
except ImportError:  # pragma: no cover - exercised only without the extra
    metadata = None
    documents = None

COLLECTIONS = (
    "products", "orders", "customers", "admins", "admin_sessions",
    "password_resets", "oauth_links", "settings", "reservations", "contacts",
)
