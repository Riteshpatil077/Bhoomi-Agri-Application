"""
Bhoomi — Admin Blueprint Routes
Per §7: Admin endpoints gated by platform_role="admin"|"super_admin"
and specific AdminPermissionGrant rows.

Endpoints:
    GET  /api/admin/me/permissions    — list caller's active permission grants
    GET  /api/admin/users             — list platform users (requires user_reports)
    GET  /api/admin/users/<id>        — get single user detail (requires user_reports)
    PATCH /api/admin/users/<id>/deactivate — deactivate a user account (requires user_reports)
    PATCH /api/admin/users/<id>/activate   — reactivate a user account (requires user_reports)
"""
from __future__ import annotations

import uuid

from flask import jsonify, request
from flask_jwt_extended import jwt_required, current_user

from app.extensions import db
from app.models.user import User
from app.models.admin import AdminPermissionGrant
from app.models.audit import AuditLog
from app.rbac import platform_role_required, permission_required

from . import admin_bp


# --------------------------------------------------------------------------- #
# Helper                                                                        #
# --------------------------------------------------------------------------- #

def _log_action(action: str, resource_type: str, resource_id: str | None = None,
                reason: str | None = None, metadata: dict | None = None) -> None:
    """Insert an immutable audit log row for the current request's actor."""
    entry = AuditLog(
        actor_user_id=current_user.id if current_user else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        reason=reason,
        metadata_redacted=metadata,
    )
    db.session.add(entry)
    # Flushed but NOT committed here — caller must commit their full transaction.


# --------------------------------------------------------------------------- #
# Routes                                                                        #
# --------------------------------------------------------------------------- #

@admin_bp.route("/me/permissions", methods=["GET"])
@jwt_required()
@platform_role_required("admin", "super_admin")
def list_my_permissions():
    """
    GET /api/admin/me/permissions
    Returns all *active* permission grants for the authenticated admin.
    Super Admins receive the implicit full-access list.
    """
    user = current_user

    if user.is_super_admin:
        # Super admins implicitly hold all standard permissions
        return jsonify({
            "user_id": str(user.id),
            "platform_role": user.platform_role,
            "implicit_super_admin": True,
            "permissions": list(AdminPermissionGrant.STANDARD_PERMISSIONS),
        }), 200

    grants = (
        AdminPermissionGrant.query
        .filter_by(admin_user_id=user.id, revoked_at=None)
        .all()
    )

    return jsonify({
        "user_id": str(user.id),
        "platform_role": user.platform_role,
        "implicit_super_admin": False,
        "permissions": [g.to_dict() for g in grants],
    }), 200


@admin_bp.route("/users", methods=["GET"])
@jwt_required()
@platform_role_required("admin", "super_admin")
@permission_required("user_reports")
def list_users():
    """
    GET /api/admin/users
    Paginated list of all platform users.
    Query params: page (default 1), per_page (default 20, max 100),
                  platform_role, user_type, is_active.
    Requires: user_reports permission.
    """
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    filter_role = request.args.get("platform_role")
    filter_type = request.args.get("user_type")
    filter_active = request.args.get("is_active")

    q = User.query
    if filter_role:
        q = q.filter_by(platform_role=filter_role)
    if filter_type:
        q = q.filter_by(user_type=filter_type)
    if filter_active is not None:
        active_bool = filter_active.lower() in ("1", "true", "yes")
        q = q.filter_by(is_active=active_bool)

    q = q.order_by(User.created_at.desc())
    paginated = q.paginate(page=page, per_page=per_page, error_out=False)

    _log_action("list_users", "User", metadata={"page": page, "per_page": per_page})
    db.session.commit()

    return jsonify({
        "users": [u.to_dict() for u in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages,
        "per_page": paginated.per_page,
    }), 200


@admin_bp.route("/users/<user_id>", methods=["GET"])
@jwt_required()
@platform_role_required("admin", "super_admin")
@permission_required("user_reports")
def get_user(user_id: str):
    """
    GET /api/admin/users/<user_id>
    Fetch a single user's profile.
    Requires: user_reports permission.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    _log_action("view_user", "User", resource_id=str(uid))
    db.session.commit()

    return jsonify({"user": user.to_dict()}), 200


@admin_bp.route("/users/<user_id>/deactivate", methods=["PATCH"])
@jwt_required()
@platform_role_required("admin", "super_admin")
@permission_required("user_reports")
def deactivate_user(user_id: str):
    """
    PATCH /api/admin/users/<user_id>/deactivate
    Soft-deactivate a platform user.
    Admins cannot deactivate other Admins or Super Admins (only Super Admin can).
    Requires: user_reports permission.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    target = User.query.get(uid)
    if not target:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    actor = current_user

    # A plain admin cannot deactivate another admin or super_admin
    if actor.platform_role == "admin" and target.platform_role in ("admin", "super_admin"):
        return jsonify({
            "error": "forbidden",
            "message": "Admins cannot deactivate other admin-tier accounts.",
        }), 403

    # Cannot deactivate yourself
    if str(actor.id) == str(uid):
        return jsonify({"error": "forbidden", "message": "Cannot deactivate your own account."}), 403

    body = request.get_json(silent=True) or {}
    reason = body.get("reason")

    target.is_active = False
    _log_action("deactivate_user", "User", resource_id=str(uid), reason=reason)
    db.session.commit()

    return jsonify({"message": "User deactivated.", "user": target.to_dict()}), 200


@admin_bp.route("/users/<user_id>/activate", methods=["PATCH"])
@jwt_required()
@platform_role_required("admin", "super_admin")
@permission_required("user_reports")
def activate_user(user_id: str):
    """
    PATCH /api/admin/users/<user_id>/activate
    Reactivate a previously deactivated user.
    Requires: user_reports permission.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    target = User.query.get(uid)
    if not target:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    actor = current_user

    # Plain admin cannot reactivate other admin-tier accounts
    if actor.platform_role == "admin" and target.platform_role in ("admin", "super_admin"):
        return jsonify({
            "error": "forbidden",
            "message": "Admins cannot reactivate other admin-tier accounts.",
        }), 403

    body = request.get_json(silent=True) or {}
    reason = body.get("reason")

    target.is_active = True
    _log_action("activate_user", "User", resource_id=str(uid), reason=reason)
    db.session.commit()

    return jsonify({"message": "User reactivated.", "user": target.to_dict()}), 200
