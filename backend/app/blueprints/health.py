"""
Bhoomi — Health-check blueprint
Provides /healthz (liveness) and /readyz (readiness) endpoints.
These are NOT under /api because load balancers probe them directly.
"""
from flask import Blueprint, jsonify
from sqlalchemy import text

from ..extensions import db

health_bp = Blueprint("health", __name__)


@health_bp.get("/healthz")
def liveness():
    """Liveness probe — app is alive."""
    return jsonify({"status": "ok"}), 200


@health_bp.get("/readyz")
def readiness():
    """
    Readiness probe — app can serve traffic.
    Checks: database connectivity.
    Returns 503 if any dependency is unhealthy so the load balancer can
    route traffic away.
    """
    checks: dict[str, str] = {}
    healthy = True

    try:
        db.session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"
        healthy = False

    return jsonify({"status": "ok" if healthy else "degraded", "checks": checks}), (
        200 if healthy else 503
    )
