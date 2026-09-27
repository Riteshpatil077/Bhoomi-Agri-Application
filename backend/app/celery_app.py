"""
Bhoomi — Celery factory
Creates and configures the Celery application, bound to the Flask app context.
"""
from __future__ import annotations

from celery import Celery, Task
from flask import Flask

# Global Celery instance for tasks and shared decorators
celery: Celery = Celery("bhoomi")


def make_celery(app: Flask) -> Celery:
    """
    Return a Celery instance wired to Flask's app context.
    Every Celery task runs inside a pushed application context so that
    db, jwt, and other extensions are available without manual context management.
    """

    class FlaskTask(Task):
        def __call__(self, *args, **kwargs):  # type: ignore[override]
            with app.app_context():
                return self.run(*args, **kwargs)

    global celery
    celery.Task = FlaskTask
    celery.config_from_object(
        {
            "broker_url": app.config["CELERY_BROKER_URL"],
            "result_backend": app.config["CELERY_RESULT_BACKEND"],
            "task_serializer": "json",
            "result_serializer": "json",
            "accept_content": ["json"],
            "timezone": "UTC",
            "enable_utc": True,
            "include": [
                "app.tasks.activities",
                "app.tasks.verification",
                "app.tasks.weather",
            ],
            # Beat schedule (§5, §7, §8)
            "beat_schedule": {
                "purge-expired-verification-docs-hourly": {
                    "task": "app.tasks.verification.purge_expired_verification_docs",
                    "schedule": 3600.0,  # Run every hour
                },
                "check-due-farm-activities-daily": {
                    "task": "app.tasks.activities.check_due_activities_and_notify",
                    "schedule": 86400.0,  # Run daily
                },
                "poll-weather-forecasts-periodic": {
                    "task": "app.tasks.weather.poll_weather_forecasts",
                    "schedule": 10800.0,  # Run every 3 hours
                },
            },
        }
    )
    # Import eagerly so task names are registered in the worker process before
    # beat dispatches them. `include` also keeps registration correct in Celery CLI.
    from app.tasks import activities, verification, weather  # noqa: F401
    celery.set_default()
    app.extensions["celery"] = celery
    return celery
