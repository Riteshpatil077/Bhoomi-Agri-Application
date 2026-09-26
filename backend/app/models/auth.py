"""
Bhoomi — Refresh Token Model
Tracks active sessions, supports single/all-device logout, and token family revocation per §6.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, utc_now


class RefreshToken(db.Model, UUIDPrimaryKeyMixin):
    """
    Persisted refresh token session.
    - token_family: used to detect reuse of rotated tokens and revoke whole family.
    - is_revoked: explicitly revoked on logout or token rotation.
    """
    __tablename__ = "refresh_tokens"

    user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = db.Column(db.String(255), unique=True, nullable=False, index=True)
    token_family = db.Column(db.String(100), nullable=False, index=True)
    is_revoked = db.Column(db.Boolean, nullable=False, default=False, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )
    user_agent = db.Column(db.String(500), nullable=True)
    ip_address = db.Column(db.String(100), nullable=True)

    # Relationships
    user = db.relationship("User", back_populates="refresh_tokens")

    @property
    def is_expired(self) -> bool:
        """Check if token is expired relative to current UTC time."""
        if not self.expires_at:
            return False
        expires = self.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= expires

    @property
    def is_valid(self) -> bool:
        """Check if token is neither revoked nor expired."""
        return not self.is_revoked and not self.is_expired

    def revoke(self) -> None:
        """Revoke this token."""
        self.is_revoked = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "token_family": self.token_family,
            "is_revoked": self.is_revoked,
            "is_valid": self.is_valid,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
        }

    def __repr__(self) -> str:
        status = "revoked" if self.is_revoked else ("expired" if self.is_expired else "active")
        return f"<RefreshToken {self.id} user={self.user_id} family={self.token_family} ({status})>"
