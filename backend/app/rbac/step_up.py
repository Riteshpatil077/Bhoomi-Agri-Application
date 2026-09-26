"""
Bhoomi — Step-up Re-authentication
Enforces password re-entry within the same request for high-privilege operations per §6 & §7.
"""
from __future__ import annotations

from functools import wraps
from typing import Callable, Any

from flask import request, jsonify
from flask_jwt_extended import current_user


def verify_step_up_password(user: Any, password: str | None) -> bool:
    """Verify user password for step-up authentication."""
    if not user or not password:
        return False
    return user.check_password(password)


def require_step_up_auth(fn: Callable) -> Callable:
    """
    Decorator requiring the request payload or header to include the user's password
    as step-up confirmation, even if a valid JWT session exists.
    Checks json field 'step_up_password' or 'password', or header 'X-Step-Up-Password'.
    """
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        # User must be authenticated
        if not current_user:
            return jsonify({
                "error": "authentication_required",
                "message": "Authentication required for this operation",
            }), 401

        # Look for password confirmation in JSON body or header
        step_up_pw = None
        if request.is_json and request.json:
            step_up_pw = request.json.get("step_up_password") or request.json.get("password")

        if not step_up_pw:
            step_up_pw = request.headers.get("X-Step-Up-Password")

        if not step_up_pw or not verify_step_up_password(current_user, step_up_pw):
            return jsonify({
                "error": "step_up_auth_required",
                "message": "Valid password confirmation required for this sensitive action.",
            }), 401

        return fn(*args, **kwargs)

    return wrapper
