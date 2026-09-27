"""
Bhoomi — Super Admin Blueprint Routes
Per §7: endpoints exclusively for platform_role="super_admin".

Endpoints:
    GET  /api/super-admin/admins                           — list all admin/super_admin accounts
    POST /api/super-admin/admins                           — create a new admin or super_admin account
    PATCH /api/super-admin/admins/<id>/deactivate          — deactivate admin/super_admin account
    PATCH /api/super-admin/admins/<id>/activate            — reactivate admin/super_admin account
    GET  /api/super-admin/admins/<id>/permissions          — list permission grants for an admin
    POST /api/super-admin/admins/<id>/permissions          — grant a permission to an admin
    DELETE /api/super-admin/admins/<id>/permissions/<key>  — revoke a permission from an admin
    GET  /api/super-admin/audit-logs                       — paginated audit log viewer
"""
from __future__ import annotations

import uuid
import re
from datetime import datetime, timezone

from flask import jsonify, request
from flask_jwt_extended import jwt_required, current_user
from marshmallow import Schema, fields, validate, ValidationError, EXCLUDE

from app.extensions import db
from app.models.user import User
from app.models.admin import AdminPermissionGrant
from app.models.audit import AuditLog
from app.models.platform_setting import PlatformSetting
from app.rbac import platform_role_required, permission_required, require_step_up_auth

from . import super_admin_bp


# --------------------------------------------------------------------------- #
# Schemas                                                                       #
# --------------------------------------------------------------------------- #

class CreateAdminSchema(Schema):
    """Validates payload for creating an admin/super_admin account."""
    class Meta:
        unknown = EXCLUDE

    full_name = fields.Str(required=True, validate=validate.Length(min=2, max=255))
    phone_number = fields.Str(required=True, validate=validate.Length(min=7, max=20))
    email = fields.Email(load_default=None)
    password = fields.Str(required=True, validate=validate.Length(min=8))
    step_up_password = fields.Str(load_default=None, load_only=True)
    platform_role = fields.Str(
        required=True,
        validate=validate.OneOf(["admin", "super_admin"]),
    )
    user_type = fields.Str(
        load_default=None,
        validate=validate.OneOf(User.USER_TYPES),
        allow_none=True,
    )


class GrantPermissionSchema(Schema):
    """Validates payload for granting a permission."""
    class Meta:
        unknown = EXCLUDE

    permission_key = fields.Str(
        required=True,
        validate=validate.Length(min=3, max=100),
    )


_create_admin_schema = CreateAdminSchema()
_grant_perm_schema = GrantPermissionSchema()


@super_admin_bp.route("/settings", methods=["GET"])
@jwt_required()
@platform_role_required("super_admin")
def list_platform_settings():
    settings = PlatformSetting.query.order_by(PlatformSetting.key.asc()).all()
    return jsonify({"settings": [setting.to_dict() for setting in settings]}), 200


@super_admin_bp.route("/settings/<string:key>", methods=["PUT"])
@jwt_required()
@platform_role_required("super_admin")
def update_platform_setting(key: str):
    if not re.fullmatch(r"[a-z][a-z0-9_.-]{0,119}", key):
        return jsonify({"error": "validation_error", "message": "Invalid setting key."}), 422
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "value" not in body:
        return jsonify({"error": "validation_error", "message": "A value field is required."}), 422

    setting = db.session.get(PlatformSetting, key)
    if setting is None:
        setting = PlatformSetting(key=key, value=body["value"], updated_by=current_user.id)
        db.session.add(setting)
    else:
        setting.value = body["value"]
        setting.updated_by = current_user.id
    db.session.flush()
    _log(
        "update_platform_setting",
        "PlatformSetting",
        resource_id=key,
        metadata={"value": body["value"]},
    )
    db.session.commit()
    return jsonify({"message": "Platform setting saved.", "setting": setting.to_dict()}), 200


# --------------------------------------------------------------------------- #
# Helper                                                                        #
# --------------------------------------------------------------------------- #

def _log(action: str, resource_type: str, resource_id: str | None = None,
         reason: str | None = None, metadata: dict | None = None) -> None:
    """Append an AuditLog row for the current actor. Caller must commit."""
    db.session.add(AuditLog(
        actor_user_id=current_user.id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        reason=reason,
        metadata_redacted=metadata,
    ))


# --------------------------------------------------------------------------- #
# Admin account management                                                      #
# --------------------------------------------------------------------------- #

@super_admin_bp.route("/admins", methods=["GET"])
@jwt_required()
@platform_role_required("super_admin")
def list_admins():
    """
    GET /api/super-admin/admins
    List all admin and super_admin accounts.
    """
    admins = (
        User.query
        .filter(User.platform_role.in_(["admin", "super_admin"]))
        .order_by(User.created_at.desc())
        .all()
    )
    return jsonify({"admins": [u.to_dict() for u in admins]}), 200


@super_admin_bp.route("/admins", methods=["POST"])
@jwt_required()
@platform_role_required("super_admin")
@require_step_up_auth
def create_admin():
    """
    POST /api/super-admin/admins
    Create a new admin or super_admin account.
    Body: { full_name, phone_number, email?, password, platform_role, user_type? }
    """
    body = request.get_json(silent=True) or {}
    try:
        data = _create_admin_schema.load(body)
    except ValidationError as exc:
        return jsonify({"error": "validation_error", "details": exc.messages}), 422

    # Duplicate phone check
    if User.query.filter_by(phone_number=data["phone_number"]).first():
        return jsonify({"error": "conflict", "message": "Phone number already registered."}), 409

    # Duplicate email check
    if data.get("email") and User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "conflict", "message": "Email already registered."}), 409

    new_user = User(
        full_name=data["full_name"],
        phone_number=data["phone_number"],
        email=data.get("email"),
        platform_role=data["platform_role"],
        user_type=data.get("user_type"),
        is_phone_verified=True,    # Admin accounts are implicitly verified
    )
    new_user.set_password(data["password"])

    db.session.add(new_user)
    db.session.flush()   # get ID before logging

    _log(
        "promote_to_super_admin" if data["platform_role"] == "super_admin" else "create_admin_account",
        "User",
        resource_id=str(new_user.id),
        metadata={"platform_role": data["platform_role"]},
    )
    db.session.commit()

    return jsonify({"message": "Admin account created.", "user": new_user.to_dict()}), 201


@super_admin_bp.route("/admins/<user_id>/deactivate", methods=["PATCH"])
@jwt_required()
@platform_role_required("super_admin")
def deactivate_admin(user_id: str):
    """
    PATCH /api/super-admin/admins/<user_id>/deactivate
    Deactivate an admin or super_admin account.
    Cannot deactivate yourself.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    target = User.query.get(uid)
    if not target:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    if str(current_user.id) == str(uid):
        return jsonify({"error": "forbidden", "message": "Cannot deactivate your own account."}), 403

    if target.platform_role not in ("admin", "super_admin"):
        return jsonify({
            "error": "bad_request",
            "message": "This endpoint manages admin-tier accounts only.",
        }), 400

    body = request.get_json(silent=True) or {}
    reason = body.get("reason")
    if not isinstance(reason, str) or len(reason.strip()) < 5:
        return jsonify({"error": "validation_error", "message": "A reason of at least 5 characters is required."}), 422
    reason = reason.strip()

    target.is_active = False
    _log("deactivate_admin_account", "User", resource_id=str(uid), reason=reason)
    db.session.commit()

    return jsonify({"message": "Admin account deactivated.", "user": target.to_dict()}), 200


@super_admin_bp.route("/admins/<user_id>/activate", methods=["PATCH"])
@jwt_required()
@platform_role_required("super_admin")
def activate_admin(user_id: str):
    """
    PATCH /api/super-admin/admins/<user_id>/activate
    Reactivate an admin or super_admin account.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    target = User.query.get(uid)
    if not target:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    if target.platform_role not in ("admin", "super_admin"):
        return jsonify({
            "error": "bad_request",
            "message": "This endpoint manages admin-tier accounts only.",
        }), 400

    body = request.get_json(silent=True) or {}
    reason = body.get("reason")
    if not isinstance(reason, str) or len(reason.strip()) < 5:
        return jsonify({"error": "validation_error", "message": "A reason of at least 5 characters is required."}), 422
    reason = reason.strip()

    target.is_active = True
    _log("activate_admin_account", "User", resource_id=str(uid), reason=reason)
    db.session.commit()

    return jsonify({"message": "Admin account activated.", "user": target.to_dict()}), 200


# --------------------------------------------------------------------------- #
# Permission grant management                                                   #
# --------------------------------------------------------------------------- #

@super_admin_bp.route("/admins/<user_id>/permissions", methods=["GET"])
@jwt_required()
@platform_role_required("super_admin")
def list_admin_permissions(user_id: str):
    """
    GET /api/super-admin/admins/<user_id>/permissions
    List all permission grants (active and revoked) for an admin.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    target = User.query.get(uid)
    if not target:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    if target.platform_role not in ("admin", "super_admin"):
        return jsonify({"error": "bad_request", "message": "Target must be an admin-tier account."}), 400

    grants = (
        AdminPermissionGrant.query
        .filter_by(admin_user_id=uid)
        .order_by(AdminPermissionGrant.granted_at.desc())
        .all()
    )

    return jsonify({
        "user_id": user_id,
        "grants": [g.to_dict() for g in grants],
        "active_permissions": [g.permission_key for g in grants if g.is_active],
    }), 200


@super_admin_bp.route("/admins/<user_id>/permissions", methods=["POST"])
@jwt_required()
@platform_role_required("super_admin")
def grant_permission(user_id: str):
    """
    POST /api/super-admin/admins/<user_id>/permissions
    Grant a permission to an admin.
    Body: { permission_key }
    Idempotent — returns 200 if grant already active, 201 for a new grant.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    target = User.query.get(uid)
    if not target:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    if target.platform_role not in ("admin", "super_admin"):
        return jsonify({"error": "bad_request", "message": "Target must be an admin-tier account."}), 400

    body = request.get_json(silent=True) or {}
    try:
        data = _grant_perm_schema.load(body)
    except ValidationError as exc:
        return jsonify({"error": "validation_error", "details": exc.messages}), 422

    perm_key = data["permission_key"]

    # Check for existing active grant (idempotent)
    existing = (
        AdminPermissionGrant.query
        .filter_by(admin_user_id=uid, permission_key=perm_key, revoked_at=None)
        .first()
    )
    if existing:
        return jsonify({
            "message": "Permission already active.",
            "grant": existing.to_dict(),
        }), 200

    grant = AdminPermissionGrant(
        admin_user_id=uid,
        permission_key=perm_key,
        granted_by=current_user.id,
    )
    db.session.add(grant)
    db.session.flush()

    _log(
        "grant_permission",
        "AdminPermissionGrant",
        resource_id=str(grant.id),
        metadata={"permission_key": perm_key, "target_user_id": user_id},
    )
    db.session.commit()

    return jsonify({"message": "Permission granted.", "grant": grant.to_dict()}), 201


@super_admin_bp.route("/admins/<user_id>/permissions/<permission_key>", methods=["DELETE"])
@jwt_required()
@platform_role_required("super_admin")
def revoke_permission(user_id: str, permission_key: str):
    """
    DELETE /api/super-admin/admins/<user_id>/permissions/<permission_key>
    Revoke an active permission grant from an admin.
    """
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return jsonify({"error": "invalid_id", "message": "Invalid user ID format."}), 400

    target = User.query.get(uid)
    if not target:
        return jsonify({"error": "not_found", "message": "User not found."}), 404

    active_grant = (
        AdminPermissionGrant.query
        .filter_by(admin_user_id=uid, permission_key=permission_key, revoked_at=None)
        .first()
    )
    if not active_grant:
        return jsonify({
            "error": "not_found",
            "message": f"No active grant for permission '{permission_key}' found.",
        }), 404

    active_grant.revoke(revoker_user_id=current_user.id)
    _log(
        "revoke_permission",
        "AdminPermissionGrant",
        resource_id=str(active_grant.id),
        metadata={"permission_key": permission_key, "target_user_id": user_id},
    )
    db.session.commit()

    return jsonify({"message": "Permission revoked.", "grant": active_grant.to_dict()}), 200


# --------------------------------------------------------------------------- #
# Audit log viewer                                                              #
# --------------------------------------------------------------------------- #

@super_admin_bp.route("/audit-logs", methods=["GET"])
@jwt_required()
@platform_role_required("super_admin")
@permission_required("audit_log_view", allow_super_admin_bypass=False)
def view_audit_logs():
    """
    GET /api/super-admin/audit-logs
    Paginated audit log.
    Query params: page, per_page (max 200), actor_user_id, action, resource_type.
    """
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 50, type=int), 200)
    filter_actor = request.args.get("actor_user_id")
    filter_action = request.args.get("action")
    filter_resource = request.args.get("resource_type")

    q = AuditLog.query
    if filter_actor:
        try:
            q = q.filter_by(actor_user_id=uuid.UUID(filter_actor))
        except ValueError:
            return jsonify({"error": "invalid_id", "message": "Invalid actor_user_id."}), 400
    if filter_action:
        q = q.filter_by(action=filter_action)
    if filter_resource:
        q = q.filter_by(resource_type=filter_resource)

    q = q.order_by(AuditLog.created_at.desc())
    paginated = q.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "audit_logs": [log.to_dict() for log in paginated.items],
        "total": paginated.total,
        "page": paginated.page,
        "pages": paginated.pages,
        "per_page": paginated.per_page,
    }), 200
