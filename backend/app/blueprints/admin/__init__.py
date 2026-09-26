"""
Bhoomi — Admin Blueprint
Exposes restricted admin-only endpoints gated by platform_role and permission grants.
"""
from flask import Blueprint

admin_bp = Blueprint("admin", __name__)

from . import routes  # noqa: E402, F401 — import routes to register them
