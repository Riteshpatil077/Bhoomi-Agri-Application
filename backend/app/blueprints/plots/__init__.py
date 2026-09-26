"""
Bhoomi — Plots Blueprint
CRUD for plots within a farm with strict owner-only access per §4 & Prompt 6.
"""
from flask import Blueprint

plots_bp = Blueprint("plots", __name__)

from . import routes  # noqa: E402, F401
