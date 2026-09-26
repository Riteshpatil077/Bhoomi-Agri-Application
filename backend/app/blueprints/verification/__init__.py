"""
Bhoomi — Farmer Verification Blueprint
Exposes photo upload URL generation, verification submission, and admin review endpoints per §5.
"""
from flask import Blueprint

verification_bp = Blueprint("verification", __name__)

from . import routes  # noqa: E402, F401
