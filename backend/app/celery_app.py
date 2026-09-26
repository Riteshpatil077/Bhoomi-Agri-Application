"""
Bhoomi — Celery factory
Creates and configures the Celery application, bound to the Flask app context.
"""
from __future__ import annotations

from celery import Celery, Task
from flask import Flask


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

    celery_app = Celery(app.name, task_cls=FlaskTask)
    celery_app.config_from_object(
        {
            "broker_url": app.config["CELERY_BROKER_URL"],
            "result_backend": app.config["CELERY_RESULT_BACKEND"],
            "task_serializer": "json",
            "result_serializer": "json",
            "accept_content": ["json"],
            "timezone": "UTC",
            "enable_utc": True,
            # Beat schedule — tasks registered per module in Prompts 5–8.
            "beat_schedule": {},
        }
    )
    celery_app.set_default()
    app.extensions["celery"] = celery_app
    return celery_app
