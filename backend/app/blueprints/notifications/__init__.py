"""
Bhoomi — Notifications Blueprint
User notification center for activity reminders, weather alerts, and system notices.
"""
from flask import Blueprint

notifications_bp = Blueprint("notifications", __name__)

from . import routes  # noqa: E402, F401
