"""
Bhoomi — Notification Model
Stores in-app alerts and notifications across modules per §1 & Prompt 7.
"""
from __future__ import annotations

import uuid
from typing import Any
from sqlalchemy import func
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, utc_now


class Notification(db.Model, UUIDPrimaryKeyMixin):
    """
    Notification entity for activity reminders, weather alerts, and system notices.
    """
    __tablename__ = "notifications"

    TYPE_ACTIVITY_REMINDER = "activity_reminder"
    TYPE_WEATHER_ALERT = "weather_alert"
    TYPE_VERIFICATION = "verification_update"
    TYPE_SYSTEM = "system"

    CHANNEL_IN_APP = "in_app"
    CHANNEL_SMS = "sms"
    CHANNEL_EMAIL = "email"

    user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    notification_type = db.Column(
        db.String(50),
        nullable=False,
        default=TYPE_ACTIVITY_REMINDER,
        index=True,
    )
    channel = db.Column(
        db.String(50),
        nullable=False,
        default=CHANNEL_IN_APP,
    )
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)
    data_json = db.Column(db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    user = db.relationship("User", backref=db.backref("notifications", lazy="dynamic", cascade="all, delete-orphan"))

    def mark_as_read(self) -> None:
        self.is_read = True
        self.read_at = utc_now()

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "title": self.title,
            "message": self.message,
            "notification_type": self.notification_type,
            "channel": self.channel,
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "data": self.data_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<Notification {self.id} user={self.user_id} type={self.notification_type} read={self.is_read}>"
