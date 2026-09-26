"""
Bhoomi — Farmer Verification Model
Implements farmer verification entity for selfie + land photo review flow per §4 & §5.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, utc_now


class FarmerVerification(db.Model, UUIDPrimaryKeyMixin):
    """
    Farmer verification submission.
    Stores S3 object keys (private bucket) for selfie and land photos.
    Reviewed by admins with verification_review grant.
    """
    __tablename__ = "farmer_verifications"

    STATUS_PENDING = "pending"
    STATUS_VERIFIED = "verified"
    STATUS_REJECTED = "rejected"
    STATUSES = (STATUS_PENDING, STATUS_VERIFIED, STATUS_REJECTED)

    user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    selfie_photo_key = db.Column(db.String(500), nullable=False)
    land_photo_key = db.Column(db.String(500), nullable=False)
    status = db.Column(
        db.String(50),
        nullable=False,
        default=STATUS_PENDING,
        index=True,
    )
    reviewed_by = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reviewed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)
    submitted_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    docs_purge_at = db.Column(db.DateTime(timezone=True), nullable=True, index=True)

    # Relationships
    user = db.relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="farmer_verifications",
    )
    reviewer = db.relationship(
        "User",
        foreign_keys=[reviewed_by],
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "status": self.status,
            "reviewed_by": str(self.reviewed_by) if self.reviewed_by else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "rejection_reason": self.rejection_reason,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "docs_purge_at": self.docs_purge_at.isoformat() if self.docs_purge_at else None,
        }

    def __repr__(self) -> str:
        return f"<FarmerVerification {self.id} user={self.user_id} status={self.status}>"
