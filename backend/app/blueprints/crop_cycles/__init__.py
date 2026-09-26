"""
Bhoomi — Crop Cycles Blueprint
CRUD for crop rotation and lifecycle tracking on plots per §4 & Prompt 6.
"""
from flask import Blueprint

crop_cycles_bp = Blueprint("crop_cycles", __name__)

from . import routes  # noqa: E402, F401
