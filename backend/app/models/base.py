"""
Bhoomi — Base Model & Mixins
Provides UUID primary key and timestamp mixins for all models.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from app.extensions import db


def utc_now() -> datetime:
    """Return timezone-aware current UTC time."""
    return datetime.now(timezone.utc)


class UUIDPrimaryKeyMixin:
    """Provides a UUIDv4 primary key compatible with PostgreSQL and SQLite."""
    id = db.Column(
        db.Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )


class TimestampMixin:
    """Provides created_at and updated_at timestamps."""
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        server_default=func.now(),
        nullable=False,
    )
