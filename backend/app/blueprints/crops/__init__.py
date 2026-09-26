"""
Bhoomi — Crops Blueprint
Provides read-only access to crop_catalog reference data per §4 & Prompt 6.
"""
from flask import Blueprint

crops_bp = Blueprint("crops", __name__)

from . import routes  # noqa: E402, F401
