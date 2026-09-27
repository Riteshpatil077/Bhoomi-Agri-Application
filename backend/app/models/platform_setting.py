"""Platform-wide key/value settings managed by Super Admins."""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import JSONB

from app.extensions import db
from .base import utc_now


class PlatformSetting(db.Model):
    __tablename__ = "platform_settings"

    key = db.Column(db.String(120), primary_key=True)
    value = db.Column(db.JSON().with_variant(JSONB, "postgresql"), nullable=False)
    updated_by = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        server_default=func.now(),
        nullable=False,
    )
    updater = db.relationship("User", foreign_keys=[updated_by])

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "value": self.value,
            "updated_by": str(self.updated_by) if self.updated_by else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
