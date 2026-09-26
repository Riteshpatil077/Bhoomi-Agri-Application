"""
Bhoomi — Weather Blueprint
Provides verified weather forecasts and agronomic advisories with provenance per §8 & Prompt 8.
"""
from flask import Blueprint

weather_bp = Blueprint("weather", __name__)

from . import routes  # noqa: E402, F401
