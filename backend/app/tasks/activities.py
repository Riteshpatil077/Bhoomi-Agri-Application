"""
Bhoomi — Farm Activity Reminders Celery Task
Periodically flags due and overdue farm activities and creates notification reminders per §1 & Prompt 7.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

from app.celery_app import celery
from app.extensions import db
from app.models.farm import Farm, Plot, CropCycle, FarmActivity
from app.models.notification import Notification
from app.utils.notifications import send_notification

logger = logging.getLogger(__name__)


@celery.task(name="app.tasks.activities.check_due_activities_and_notify")
def check_due_activities_and_notify() -> dict[str, Any]:
    """
    Checks for activities where scheduled_date <= today and completed_date is null.
    Dispatches in-app notifications to farmers.
    Avoids duplicate notifications on the same day for the same activity.
    """
    today = date.today()

    due_activities = (
        FarmActivity.query
        .join(CropCycle, FarmActivity.crop_cycle_id == CropCycle.id)
        .join(Plot, CropCycle.plot_id == Plot.id)
        .join(Farm, Plot.farm_id == Farm.id)
        .filter(
            CropCycle.status == CropCycle.STATUS_ACTIVE,
            FarmActivity.completed_date.is_(None),
            FarmActivity.scheduled_date.isnot(None),
            FarmActivity.scheduled_date <= today,
        )
        .all()
    )

    dispatched = 0
    for act in due_activities:
        cycle = act.crop_cycle
        plot = cycle.plot
        farm = plot.farm
        crop = cycle.crop_catalog
        farmer_id = farm.user_id

        # Duplicate check for today
        existing = (
            Notification.query
            .filter_by(
                user_id=farmer_id,
                notification_type=Notification.TYPE_ACTIVITY_REMINDER,
            )
            .filter(Notification.created_at >= today)
            .all()
        )
        already_notified = any(
            n.data_json and n.data_json.get("activity_id") == str(act.id)
            for n in existing
        )

        if not already_notified:
            is_overdue = act.scheduled_date < today
            status_label = "Overdue" if is_overdue else "Due Today"
            crop_name = crop.crop_name if crop else "crop"
            plot_name = plot.plot_name if plot else "plot"

            title = f"{status_label}: {act.activity_type.title()} for {crop_name}"
            message = (
                f"Your scheduled {act.activity_type} on plot '{plot_name}' "
                f"({farm.name}) was due on {act.scheduled_date}. "
                "Please complete and log your action."
            )

            send_notification(
                user_id=farmer_id,
                title=title,
                message=message,
                notification_type=Notification.TYPE_ACTIVITY_REMINDER,
                channel=Notification.CHANNEL_IN_APP,
                data={
                    "activity_id": str(act.id),
                    "crop_cycle_id": str(cycle.id),
                    "scheduled_date": act.scheduled_date.isoformat(),
                    "is_overdue": is_overdue,
                },
            )
            dispatched += 1

    logger.info("Checked farm activities. Dispatched %d reminders for %d due items.", dispatched, len(due_activities))
    return {
        "status": "success",
        "due_count": len(due_activities),
        "reminders_dispatched": dispatched,
    }
