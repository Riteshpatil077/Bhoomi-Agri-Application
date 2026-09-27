"""
Bhoomi — RBAC Enforcement Decorators
Server-side role and permission checks per §7.

All checks are performed against the live database row on every request.
Client-side UI gating is a convenience only; these decorators are the
security boundary.

Decorators:
    platform_role_required(*roles)  — requires current_user.platform_role in roles
    permission_required(key)        — requires an active AdminPermissionGrant row
                                      OR super_admin shortcut
"""
from __future__ import annotations

from functools import wraps
from typing import Callable, Any

from flask import jsonify
from flask_jwt_extended import current_user, verify_jwt_in_request


def platform_role_required(*roles: str) -> Callable:
    """
    Decorator that enforces ``current_user.platform_role`` is among *roles*.

    Must be applied AFTER ``@jwt_required()`` (or it calls verify_jwt_in_request
    itself so it can be used standalone).

    Returns 401 when no valid JWT is present, 403 when role does not match.

    Usage::

        @bp.route("/admin/dashboard")
        @jwt_required()
        @platform_role_required("admin", "super_admin")
        def admin_dashboard():
            ...
    """
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Ensure JWT is validated (idempotent if already called)
            try:
                verify_jwt_in_request()
            except Exception:
                return jsonify({
                    "error": "authentication_required",
                    "message": "A valid session is required.",
                }), 401

            user = current_user
            if user is None or not user.is_active:
                return jsonify({
                    "error": "authentication_required",
                    "message": "A valid session is required.",
                }), 401

            if user.platform_role not in roles:
                return jsonify({
                    "error": "forbidden",
                    "message": "You do not have the required role for this action.",
                    "required_roles": list(roles),
                    "your_role": user.platform_role,
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


def user_type_required(*user_types: str) -> Callable:
    """Require the authenticated account's current domain role."""
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                verify_jwt_in_request()
            except Exception:
                return jsonify({
                    "error": "authentication_required",
                    "message": "A valid session is required.",
                }), 401

            user = current_user
            if user is None or not user.is_active:
                return jsonify({
                    "error": "authentication_required",
                    "message": "A valid session is required.",
                }), 401
            if user.user_type not in user_types:
                return jsonify({
                    "error": "forbidden",
                    "message": "Your account type cannot access this resource.",
                    "required_user_types": list(user_types),
                    "your_user_type": user.user_type,
                }), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def permission_required(permission_key: str, allow_super_admin_bypass: bool = False) -> Callable:
    """
    Decorator that checks for an **active** ``AdminPermissionGrant`` row.

    Super Admins require explicit grants by default. Set
    ``allow_super_admin_bypass=True`` only for non-sensitive capabilities that
    the platform policy deliberately grants to every Super Admin by role.
    Users always receive 403.

    Must be applied AFTER ``@jwt_required()`` and ``@platform_role_required("admin", "super_admin")``.
    """
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                verify_jwt_in_request()
            except Exception:
                return jsonify({
                    "error": "authentication_required",
                    "message": "A valid session is required.",
                }), 401

            user = current_user
            if user is None or not user.is_active:
                return jsonify({
                    "error": "authentication_required",
                    "message": "A valid session is required.",
                }), 401

            # Super Admins bypass permission grants if allowed
            if user.platform_role == "super_admin" and allow_super_admin_bypass:
                return fn(*args, **kwargs)

            # Both Admin and Super Admin (when bypass is disallowed) can hold grants
            if user.platform_role not in ("admin", "super_admin"):
                return jsonify({
                    "error": "forbidden",
                    "message": "Admin or Super Admin role required.",
                }), 403

            # Query live DB — never cache RBAC decisions
            from app.models.admin import AdminPermissionGrant
            active_grant = (
                AdminPermissionGrant.query
                .filter_by(
                    admin_user_id=user.id,
                    permission_key=permission_key,
                    revoked_at=None,
                )
                .first()
            )

            if not active_grant:
                return jsonify({
                    "error": "permission_denied",
                    "message": f"Missing active grant for permission: '{permission_key}'.",
                    "required_permission": permission_key,
                }), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


def verified_farmer_required(fn: Callable) -> Callable:
    """
    Decorator requiring the caller to be a verified farmer.
    Returns 401 if unauthenticated, 403 if not farmer or unverified.
    Per §7 & Prompt 5: unverified user blocked from farmer-only endpoints.
    """
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            verify_jwt_in_request()
        except Exception:
            return jsonify({
                "error": "authentication_required",
                "message": "A valid session is required.",
            }), 401

        user = current_user
        if user is None or not user.is_active:
            return jsonify({
                "error": "authentication_required",
                "message": "A valid session is required.",
            }), 401

        if user.user_type != "farmer":
            return jsonify({
                "error": "forbidden",
                "message": "Farmer account required.",
            }), 403

        if user.verification_status != "verified":
            return jsonify({
                "error": "verification_required",
                "message": "Verified farmer status is required to access this resource.",
                "verification_status": user.verification_status,
            }), 403

        return fn(*args, **kwargs)
    return wrapper
