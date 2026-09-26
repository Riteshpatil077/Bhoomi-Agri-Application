"""
Bhoomi — Super Admin Blueprint
Exposes endpoints exclusive to platform_role="super_admin".
"""
from flask import Blueprint

super_admin_bp = Blueprint("super_admin", __name__)

from . import routes  # noqa: E402, F401 — import routes to register them
