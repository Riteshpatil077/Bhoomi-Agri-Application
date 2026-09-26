"""
Bhoomi — Audit Log Model
Implements immutable audit logging with mandatory reason field for sensitive operations per §4, §5 & §9.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, utc_now


class AuditLog(db.Model, UUIDPrimaryKeyMixin):
    """
    Audit log record.
    Tracks security-sensitive events, administrative actions, and document views.
    'reason' is strictly mandatory when viewing private verification documents.
    """
    __tablename__ = "audit_logs"

    actor_user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = db.Column(db.String(100), nullable=False, index=True)
    resource_type = db.Column(db.String(100), nullable=False, index=True)
    resource_id = db.Column(db.String(100), nullable=True, index=True)
    reason = db.Column(db.String(500), nullable=True)  # Required for sensitive document views per §5
    metadata_redacted = db.Column(db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    actor = db.relationship("User", foreign_keys=[actor_user_id])

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "actor_user_id": str(self.actor_user_id) if self.actor_user_id else None,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "reason": self.reason,
            "metadata_redacted": self.metadata_redacted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<AuditLog {self.id} actor={self.actor_user_id} action={self.action} on={self.resource_type}>"
