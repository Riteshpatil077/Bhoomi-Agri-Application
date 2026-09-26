"""
Bhoomi — JWT Callbacks & Error Handlers
Wires user lookup, claims, and error handling for Flask-JWT-Extended per §6.
"""
from __future__ import annotations

import uuid
from flask import jsonify
from flask_jwt_extended import JWTManager
from flask_jwt_extended.exceptions import CSRFError

from app.models.user import User


def configure_jwt(app, jwt: JWTManager) -> None:
    """Register all loaders and error handlers on JWTManager."""

    @jwt.user_identity_loader
    def user_identity_lookup(user):
        """Serialize user identity to string."""
        return str(user.id) if hasattr(user, "id") else str(user)

    @jwt.user_lookup_loader
    def user_lookup_callback(_jwt_header, jwt_data):
        """
        Re-verify user existence and active status against the database
        on every single authenticated request per §6 & §7.
        """
        identity = jwt_data.get("sub")
        if not identity:
            return None
        try:
            user_uuid = uuid.UUID(identity)
        except (ValueError, TypeError):
            return None
        return User.query.filter_by(id=user_uuid, is_active=True).first()

    @jwt.additional_claims_loader
    def add_claims_to_access_token(user):
        """
        Add informational claims to access token.
        Note: Server endpoints re-query DB for authority checks (§7).
        """
        if hasattr(user, "id"):
            return {
                "user_id": str(user.id),
                "platform_role": user.platform_role,
                "user_type": user.user_type,
            }
        return {}

    @jwt.expired_token_loader
    def expired_token_callback(_jwt_header, _jwt_data):
        return jsonify({
            "error": "token_expired",
            "message": "The token has expired. Please refresh your session.",
        }), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        return jsonify({
            "error": "invalid_token",
            "message": f"Signature verification failed: {error_string}",
        }), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error_string):
        return jsonify({
            "error": "authorization_required",
            "message": f"Authorization required: {error_string}",
        }), 401

    @jwt.revoked_token_loader
    def revoked_token_callback(_jwt_header, _jwt_data):
        return jsonify({
            "error": "token_revoked",
            "message": "The token has been revoked.",
        }), 401

    @app.errorhandler(CSRFError)
    def handle_csrf_error(err):
        return jsonify({
            "error": "csrf_error",
            "message": "Missing or invalid CSRF token in request header.",
        }), 401
