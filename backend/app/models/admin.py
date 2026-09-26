"""
Bhoomi — Admin Permission Grants Model
Implements granular permission grants for Admins per §4 & §7.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, Index
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, utc_now


class AdminPermissionGrant(db.Model, UUIDPrimaryKeyMixin):
    """
    Granular permission grant given to an Admin by a Super Admin.
    Bare admin platform role does not bypass; active grant is checked.
    """
    __tablename__ = "admin_permission_grants"

    # Known standard permissions per §4, §5, §7
    PERMISSION_VERIFICATION_REVIEW = "verification_review"
    PERMISSION_CONTENT_MODERATION = "content_moderation"
    PERMISSION_USER_REPORTS = "user_reports"
    PERMISSION_AUDIT_LOG_VIEW = "audit_log_view"

    STANDARD_PERMISSIONS = (
        PERMISSION_VERIFICATION_REVIEW,
        PERMISSION_CONTENT_MODERATION,
        PERMISSION_USER_REPORTS,
        PERMISSION_AUDIT_LOG_VIEW,
    )

    admin_user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission_key = db.Column(db.String(100), nullable=False, index=True)
    granted_by = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    granted_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True, index=True)
    revoked_by = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    admin_user = db.relationship("User", foreign_keys=[admin_user_id], back_populates="permission_grants")
    granter = db.relationship("User", foreign_keys=[granted_by])
    revoker = db.relationship("User", foreign_keys=[revoked_by])

    # Table arguments & composite indexes per §4:
    # composite (admin_user_id, permission_key)
    __table_args__ = (
        Index("ix_admin_permission_grants_user_perm", "admin_user_id", "permission_key"),
    )

    @property
    def is_active(self) -> bool:
        """A grant is active if revoked_at is None."""
        return self.revoked_at is None

    def revoke(self, revoker_user_id: uuid.UUID) -> None:
        """Mark permission grant as revoked."""
        self.revoked_at = datetime.now(timezone.utc)
        self.revoked_by = revoker_user_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "admin_user_id": str(self.admin_user_id),
            "permission_key": self.permission_key,
            "granted_by": str(self.granted_by) if self.granted_by else None,
            "granted_at": self.granted_at.isoformat() if self.granted_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "revoked_by": str(self.revoked_by) if self.revoked_by else None,
            "is_active": self.is_active,
        }

    def __repr__(self) -> str:
        status = "active" if self.is_active else f"revoked@{self.revoked_at}"
        return f"<AdminPermissionGrant {self.admin_user_id} {self.permission_key} ({status})>"
