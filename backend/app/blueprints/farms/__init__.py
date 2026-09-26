"""
Bhoomi — Farms Blueprint
CRUD for farmer's land holdings with strict owner-only access per §4 & Prompt 6.
"""
from flask import Blueprint

farms_bp = Blueprint("farms", __name__)

from . import routes  # noqa: E402, F401
