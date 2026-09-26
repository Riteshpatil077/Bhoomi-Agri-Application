"""
Bhoomi — Notification Service Utility
Dispatches in-app alerts and external messages (SMS/Email) per §1 & Prompt 7.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from app.extensions import db
from app.models.notification import Notification

logger = logging.getLogger(__name__)


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
    Simulates external delivery channel dispatch (SMS/Email) when requested.
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
    db.session.commit()

    if channel == Notification.CHANNEL_SMS:
        # In a real environment, integrate with Twilio / AWS SNS / MSG91
        logger.info("[SMS GATEWAY] Sent SMS to user %s: '%s - %s'", uid, title, message)
    elif channel == Notification.CHANNEL_EMAIL:
        logger.info("[EMAIL GATEWAY] Sent Email to user %s: '%s - %s'", uid, title, message)
    else:
        logger.debug("[IN-APP] Queued notification for user %s: '%s'", uid, title)

    return notif
