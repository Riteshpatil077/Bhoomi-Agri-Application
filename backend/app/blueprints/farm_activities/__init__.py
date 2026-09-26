"""
Bhoomi — Farm Activities Blueprint
Log, schedule, and track farm operations against crop cycles per §4 & Prompt 7.
"""
from flask import Blueprint

farm_activities_bp = Blueprint("farm_activities", __name__)

from . import routes  # noqa: E402, F401
