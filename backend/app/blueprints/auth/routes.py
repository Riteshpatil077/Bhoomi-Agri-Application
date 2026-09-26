"""
Bhoomi — Auth Blueprint Routes
Implements registration, login, refresh rotation with family revocation,
single and all-device logout, profile retrieval, and step-up password verification per §6 & §7.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_csrf_token,
    get_jwt,
    jwt_required,
    current_user,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)
from marshmallow import ValidationError
from sqlalchemy import or_

from app.extensions import db, limiter
from app.models.user import User
from app.models.auth import RefreshToken
from app.schemas.auth import RegisterSchema, LoginSchema, StepUpSchema

auth_bp = Blueprint("auth", __name__)

register_schema = RegisterSchema()
login_schema = LoginSchema()
step_up_schema = StepUpSchema()


@auth_bp.route("/register", methods=["POST"])
@limiter.limit("20 per minute")
def register():
    """
    Register a new user account.
    CRITICAL per §7.6: platform_role is NEVER accepted from the client;
    it is strictly ignored and forced to 'user'.
    """
    if not request.is_json:
        return jsonify({"error": "invalid_request", "message": "JSON body required"}), 400

    try:
        data = register_schema.load(request.get_json())
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    # Check unique phone number
    if User.query.filter_by(phone_number=data["phone_number"]).first():
        return jsonify({
            "error": "duplicate_phone",
            "message": "A user with this phone number is already registered.",
        }), 409

    # Check unique email if provided
    if data.get("email") and User.query.filter_by(email=data["email"]).first():
        return jsonify({
            "error": "duplicate_email",
            "message": "A user with this email address is already registered.",
        }), 409

    # Create new user — platform_role is ALWAYS forced to User.PLATFORM_ROLE_USER
    new_user = User(
        full_name=data["full_name"].strip(),
        phone_number=data["phone_number"].strip(),
        email=data.get("email").strip() if data.get("email") else None,
        user_type=data.get("user_type", User.USER_TYPE_FARMER),
        platform_role=User.PLATFORM_ROLE_USER,  # Never trust client input
        preferred_language=data.get("preferred_language", "en"),
        verification_status=User.VERIFICATION_STATUS_UNVERIFIED,
        is_active=True,
    )
    new_user.set_password(data["password"])

    db.session.add(new_user)
    db.session.commit()

    return jsonify({
        "message": "User registered successfully.",
        "user": new_user.to_dict(),
    }), 201


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("15 per minute")
def login():
    """
    Authenticate user via phone_number or email + password.
    Issues short-lived access cookie + refresh cookie, tracks session in refresh_tokens table.
    """
    if not request.is_json:
        return jsonify({"error": "invalid_request", "message": "JSON body required"}), 400

    try:
        data = login_schema.load(request.get_json())
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    identifier = data["identifier"].strip()
    user = User.query.filter(
        or_(User.phone_number == identifier, User.email == identifier)
    ).first()

    if not user or not user.is_active or not user.check_password(data["password"]):
        return jsonify({
            "error": "invalid_credentials",
            "message": "Invalid phone number/email or password.",
        }), 401

    # Issue tokens
    access_token = create_access_token(identity=user)
    refresh_token = create_refresh_token(identity=user)

    # Persist refresh token session with a unique token_family
    token_family = str(uuid.uuid4())
    decoded_refresh = decode_token(refresh_token)
    refresh_jti = decoded_refresh["jti"]
    expires_at = datetime.fromtimestamp(decoded_refresh["exp"], tz=timezone.utc)

    user_agent = request.user_agent.string if request.user_agent else None
    ip_addr = request.remote_addr

    token_record = RefreshToken(
        user_id=user.id,
        token_hash=refresh_jti,
        token_family=token_family,
        expires_at=expires_at,
        user_agent=user_agent,
        ip_address=ip_addr,
        is_revoked=False,
    )
    db.session.add(token_record)
    db.session.commit()

    # Extract CSRF tokens for double-submit protection
    csrf_access = get_csrf_token(access_token)
    csrf_refresh = get_csrf_token(refresh_token)

    response = jsonify({
        "message": "Login successful.",
        "user": user.to_dict(),
        "csrf_token": csrf_access,
        "csrf_refresh_token": csrf_refresh,
    })

    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    return response, 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """
    Refresh access token with refresh token rotation and family revocation (§6).
    - If refresh token is active: rotates it (invalidates old, issues new pair with same family).
    - If refresh token is already revoked: STOLEN TOKEN DETECTED -> revokes entire token family!
    """
    jwt_data = get_jwt()
    current_jti = jwt_data.get("jti")
    user_id_str = jwt_data.get("sub")

    # Find the persisted session
    token_record = RefreshToken.query.filter_by(token_hash=current_jti).first()

    if not token_record:
        response = jsonify({
            "error": "invalid_session",
            "message": "Refresh session not found or untracked.",
        })
        unset_jwt_cookies(response)
        return response, 401

    # Check for reuse of already-revoked refresh token (§6)
    if token_record.is_revoked:
        # SECURITY ALERT: Compromised token reused!
        # Revoke the entire token family immediately.
        RefreshToken.query.filter_by(token_family=token_record.token_family).update(
            {"is_revoked": True}
        )
        db.session.commit()

        response = jsonify({
            "error": "token_reused",
            "message": "Compromised token family detected. All sessions in this family have been revoked.",
        })
        unset_jwt_cookies(response)
        return response, 401

    # Check expiration
    if token_record.is_expired:
        token_record.revoke()
        db.session.commit()
        response = jsonify({
            "error": "session_expired",
            "message": "Refresh session has expired. Please log in again.",
        })
        unset_jwt_cookies(response)
        return response, 401

    # Verify user exists and is active
    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        response = jsonify({"error": "invalid_user", "message": "Invalid user identity."})
        unset_jwt_cookies(response)
        return response, 401

    user = User.query.filter_by(id=user_uuid, is_active=True).first()
    if not user:
        token_record.revoke()
        db.session.commit()
        response = jsonify({"error": "user_inactive", "message": "User account is disabled or missing."})
        unset_jwt_cookies(response)
        return response, 401

    # Rotate token: revoke old token
    token_record.revoke()

    # Generate new tokens
    new_access_token = create_access_token(identity=user)
    new_refresh_token = create_refresh_token(identity=user)

    decoded_new_refresh = decode_token(new_refresh_token)
    new_jti = decoded_new_refresh["jti"]
    new_expires_at = datetime.fromtimestamp(decoded_new_refresh["exp"], tz=timezone.utc)

    # Issue new refresh token within the SAME token family
    new_token_record = RefreshToken(
        user_id=user.id,
        token_hash=new_jti,
        token_family=token_record.token_family,  # Same family
        expires_at=new_expires_at,
        user_agent=request.user_agent.string if request.user_agent else None,
        ip_address=request.remote_addr,
        is_revoked=False,
    )
    db.session.add(new_token_record)
    db.session.commit()

    csrf_access = get_csrf_token(new_access_token)
    csrf_refresh = get_csrf_token(new_refresh_token)

    response = jsonify({
        "message": "Token refreshed successfully.",
        "csrf_token": csrf_access,
        "csrf_refresh_token": csrf_refresh,
    })

    set_access_cookies(response, new_access_token)
    set_refresh_cookies(response, new_refresh_token)
    return response, 200


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """
    Single-device logout.
    Revokes the current session's refresh token if identifiable, and clears cookies.
    """
    refresh_cookie_name = current_app.config.get("JWT_REFRESH_COOKIE_NAME", "refresh_token_cookie")
    raw_refresh = request.cookies.get(refresh_cookie_name)

    if raw_refresh:
        try:
            decoded = decode_token(raw_refresh)
            jti = decoded.get("jti")
            if jti:
                record = RefreshToken.query.filter_by(token_hash=jti).first()
                if record:
                    record.revoke()
                    db.session.commit()
        except Exception:
            pass  # If decoding fails, proceed with clearing cookies

    response = jsonify({"message": "Logged out successfully."})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route("/logout-all", methods=["POST"])
@jwt_required()
def logout_all():
    """
    All-devices logout.
    Revokes ALL active refresh tokens belonging to the authenticated user.
    """
    RefreshToken.query.filter_by(
        user_id=current_user.id,
        is_revoked=False,
    ).update({"is_revoked": True})
    db.session.commit()

    response = jsonify({"message": "All sessions terminated successfully."})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """
    Return currently authenticated user profile, re-verified from the DB.
    """
    return jsonify({
        "user": current_user.to_dict(),
    }), 200


@auth_bp.route("/verify-password", methods=["POST"])
@jwt_required()
def verify_password():
    """
    Endpoint for verifying password confirmation (step-up auth).
    """
    if not request.is_json:
        return jsonify({"error": "invalid_request", "message": "JSON body required"}), 400

    try:
        data = step_up_schema.load(request.get_json())
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    if not current_user.check_password(data["password"]):
        return jsonify({
            "valid": False,
            "error": "invalid_password",
            "message": "Password confirmation failed.",
        }), 401

    return jsonify({
        "valid": True,
        "message": "Password verified successfully.",
    }), 200


@auth_bp.route("/step-up-test", methods=["POST"])
@jwt_required()
def step_up_test():
    """
    Test endpoint protected by require_step_up_auth.
    Demonstrates step-up authorization requirement for Prompt 4.
    """
    from app.rbac.step_up import require_step_up_auth

    @require_step_up_auth
    def _inner():
        return jsonify({"success": True, "message": "High-privilege action executed."})

    return _inner()
