"""
Bhoomi — Notification Service Utility
Dispatches in-app alerts and external messages (SMS/Email) per §1 & Prompt 7.
"""
from __future__ import annotations

import logging
import smtplib
import uuid
from email.message import EmailMessage
from typing import Any

import boto3
from flask import current_app
from app.extensions import db
from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)


class NotificationDeliveryError(RuntimeError):
    """Raised when a requested SMS or email channel is not configured or fails."""


def _deliver_external(user: User, title: str, message: str, channel: str) -> None:
    if channel == Notification.CHANNEL_EMAIL:
        host = current_app.config.get("SMTP_HOST")
        sender = current_app.config.get("SMTP_FROM_EMAIL")
        if not host or not sender or not user.email:
            raise NotificationDeliveryError("SMTP host, sender, and recipient email are required.")
        mail = EmailMessage()
        mail["Subject"] = title
        mail["From"] = sender
        mail["To"] = user.email
        mail.set_content(message)
        try:
            with smtplib.SMTP(host, current_app.config.get("SMTP_PORT", 587), timeout=15) as smtp:
                if current_app.config.get("SMTP_USE_TLS", True):
                    smtp.starttls()
                username = current_app.config.get("SMTP_USERNAME")
                password = current_app.config.get("SMTP_PASSWORD")
                if username:
                    smtp.login(username, password or "")
                smtp.send_message(mail)
        except Exception as exc:
            raise NotificationDeliveryError("Email delivery failed.") from exc
        return

    if channel == Notification.CHANNEL_SMS:
        if not user.phone_number.startswith("+"):
            raise NotificationDeliveryError("SMS recipient must use an international phone number.")
        try:
            sns = boto3.client("sns", region_name=current_app.config.get("AWS_REGION", "ap-south-1"))
            sns.publish(PhoneNumber=user.phone_number, Message=f"{title}\n{message}")
        except Exception as exc:
            raise NotificationDeliveryError("SMS delivery failed.") from exc


def send_notification(
    user_id: uuid.UUID | str,
    title: str,
    message: str,
    notification_type: str = Notification.TYPE_ACTIVITY_REMINDER,
    channel: str = Notification.CHANNEL_IN_APP,
    data: dict[str, Any] | None = None,
) -> Notification:
    """
    Creates and records a notification for a user.
    Delivers external channels through configured SMTP or AWS SNS providers.
    """
    uid = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id

    notif = Notification(
        user_id=uid,
        title=title,
        message=message,
        notification_type=notification_type,
        channel=channel,
        data_json=data,
    )
    db.session.add(notif)
    db.session.flush()

    if channel in (Notification.CHANNEL_SMS, Notification.CHANNEL_EMAIL):
        user = db.session.get(User, uid)
        if not user:
            raise NotificationDeliveryError("Notification recipient does not exist.")
        try:
            _deliver_external(user, title, message, channel)
        except NotificationDeliveryError:
            db.session.rollback()
            raise
    else:
        logger.debug("[IN-APP] Queued notification for user %s: '%s'", uid, title)

    db.session.commit()

    return notif
