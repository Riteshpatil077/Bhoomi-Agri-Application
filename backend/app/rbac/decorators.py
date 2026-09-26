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


def permission_required(permission_key: str) -> Callable:
    """
    Decorator that checks for an **active** ``AdminPermissionGrant`` row.

    Super Admins bypass the grant check (they have all permissions implicitly).
    Regular Admins require an active (non-revoked) grant for *permission_key*.
    Users always receive 403.

    Must be applied AFTER ``@jwt_required()`` and ``@platform_role_required("admin", "super_admin")``.

    Usage::

        @bp.route("/admin/verifications")
        @jwt_required()
        @platform_role_required("admin", "super_admin")
        @permission_required("verification_review")
        def review_verifications():
            ...
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

            # Super Admins bypass permission grants
            if user.platform_role == "super_admin":
                return fn(*args, **kwargs)

            # Regular admins need an active grant
            if user.platform_role != "admin":
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
