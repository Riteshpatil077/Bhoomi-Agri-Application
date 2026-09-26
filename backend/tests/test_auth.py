"""
Prompt 3 — Auth Module Tests
Tests registration, role immunity, login, CSRF double-submit cookies,
refresh rotation, stolen-token family revocation, logout/logout-all,
profile retrieval, and step-up password verification per §6 & §7.
"""
from __future__ import annotations

import json
import uuid
from flask import jsonify

import pytest
from flask_jwt_extended import jwt_required

from app.models.user import User
from app.models.auth import RefreshToken
from app.rbac.step_up import require_step_up_auth


def test_register_success(client, db_session):
    """Register creates a new user, hashes password, defaults platform_role to user."""
    payload = {
        "full_name": "Kavita Rao",
        "phone_number": "+919876500001",
        "email": "kavita@example.com",
        "password": "StrongPassword123!",
        "user_type": "farmer",
        "preferred_language": "mr",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201

    data = response.get_json()
    assert data["message"] == "User registered successfully."
    assert data["user"]["full_name"] == "Kavita Rao"
    assert data["user"]["platform_role"] == "user"
    assert data["user"]["user_type"] == "farmer"
    assert data["user"]["preferred_language"] == "mr"
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]

    # Verify directly in DB
    user = User.query.filter_by(phone_number="+919876500001").first()
    assert user is not None
    assert user.platform_role == "user"
    assert user.check_password("StrongPassword123!") is True


def test_register_cannot_set_platform_role(client, db_session):
    """
    CRITICAL SECURITY TEST per §7.6:
    Client-supplied platform_role is NEVER honored — always forced to 'user'.
    """
    payload = {
        "full_name": "Hacker User",
        "phone_number": "+919876500002",
        "email": "hacker@example.com",
        "password": "Password123!",
        "platform_role": "super_admin",  # Attacker attempt!
        "user_type": "farmer",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201

    data = response.get_json()
    assert data["user"]["platform_role"] == "user"

    # Verify directly in DB
    user = User.query.filter_by(phone_number="+919876500002").first()
    assert user is not None
    assert user.platform_role == "user"  # Strictly 'user', never 'super_admin'


def test_register_duplicate_phone_and_email(client, db_session):
    """Duplicate phone or email returns 409 Conflict."""
    payload = {
        "full_name": "User One",
        "phone_number": "+919876500003",
        "email": "user3@example.com",
        "password": "Password123!",
    }
    resp1 = client.post("/api/auth/register", json=payload)
    assert resp1.status_code == 201

    # Duplicate phone
    resp2 = client.post("/api/auth/register", json={
        "full_name": "User Duplicate Phone",
        "phone_number": "+919876500003",
        "email": "diff@example.com",
        "password": "Password123!",
    })
    assert resp2.status_code == 409
    assert resp2.get_json()["error"] == "duplicate_phone"

    # Duplicate email
    resp3 = client.post("/api/auth/register", json={
        "full_name": "User Duplicate Email",
        "phone_number": "+919876500004",
        "email": "user3@example.com",
        "password": "Password123!",
    })
    assert resp3.status_code == 409
    assert resp3.get_json()["error"] == "duplicate_email"


def test_register_validation_errors(client):
    """Validation errors on invalid phone number or short password return 422."""
    resp = client.post("/api/auth/register", json={
        "full_name": "A",
        "phone_number": "invalid_phone",
        "password": "short",
    })
    assert resp.status_code == 422
    data = resp.get_json()
    assert "validation_error" in data["error"]
    assert "phone_number" in data["messages"]
    assert "password" in data["messages"]


def test_login_success(client, db_session):
    """
    Login issues httpOnly access and refresh cookies, returns CSRF token,
    and records active RefreshToken in the database.
    """
    user = User(
        full_name="Aarav Sharma",
        phone_number="+919876500005",
        email="aarav@example.com",
        password_hash="",
    )
    user.set_password("CorrectPass123!")
    db_session.add(user)
    db_session.commit()

    # Login using phone number
    resp = client.post("/api/auth/login", json={
        "identifier": "+919876500005",
        "password": "CorrectPass123!",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["message"] == "Login successful."
    assert "csrf_token" in data
    assert "csrf_refresh_token" in data
    assert data["user"]["full_name"] == "Aarav Sharma"

    # Verify cookies
    access_cookie = client.get_cookie("access_token_cookie")
    assert access_cookie is not None
    assert access_cookie.http_only is True

    refresh_cookie = client.get_cookie("refresh_token_cookie")
    assert refresh_cookie is not None
    assert refresh_cookie.http_only is True

    # Verify session persisted in DB
    token_records = RefreshToken.query.filter_by(user_id=user.id).all()
    assert len(token_records) == 1
    assert token_records[0].is_revoked is False
    assert token_records[0].is_valid is True


def test_login_failure_cases(client, db_session):
    """Invalid credentials or deactivated account returns 401."""
    user = User(
        full_name="Active User",
        phone_number="+919876500006",
        email="active@example.com",
        is_active=True,
    )
    user.set_password("MyPassword123!")

    deactivated = User(
        full_name="Deactivated User",
        phone_number="+919876500007",
        email="inactive@example.com",
        is_active=False,
    )
    deactivated.set_password("MyPassword123!")

    db_session.add_all([user, deactivated])
    db_session.commit()

    # Wrong password
    resp = client.post("/api/auth/login", json={
        "identifier": "+919876500006",
        "password": "WrongPassword!",
    })
    assert resp.status_code == 401

    # Non-existent user
    resp = client.post("/api/auth/login", json={
        "identifier": "+919999999999",
        "password": "MyPassword123!",
    })
    assert resp.status_code == 401

    # Deactivated account
    resp = client.post("/api/auth/login", json={
        "identifier": "+919876500007",
        "password": "MyPassword123!",
    })
    assert resp.status_code == 401


def test_csrf_rejection_on_refresh(client, db_session):
    """
    CSRF verification per §6:
    POST to /api/auth/refresh without matching CSRF header is rejected with 401.
    """
    user = User(
        full_name="CSRF Tester",
        phone_number="+919876500008",
    )
    user.set_password("Password123!")
    db_session.add(user)
    db_session.commit()

    login_resp = client.post("/api/auth/login", json={
        "identifier": "+919876500008",
        "password": "Password123!",
    })
    assert login_resp.status_code == 200

    # Request refresh WITHOUT X-CSRF-TOKEN header
    resp_no_csrf = client.post("/api/auth/refresh")
    assert resp_no_csrf.status_code == 401
    assert "csrf" in resp_no_csrf.get_json()["error"]


def test_refresh_rotation(client, db_session):
    """
    Refresh token rotation per §6:
    Every refresh issues new tokens, invalidates the old one, and keeps the same token family.
    """
    user = User(
        full_name="Rotation User",
        phone_number="+919876500009",
    )
    user.set_password("Password123!")
    db_session.add(user)
    db_session.commit()

    login_resp = client.post("/api/auth/login", json={
        "identifier": "+919876500009",
        "password": "Password123!",
    })
    assert login_resp.status_code == 200
    login_data = login_resp.get_json()
    csrf_refresh = login_data["csrf_refresh_token"]

    initial_tokens = RefreshToken.query.filter_by(user_id=user.id).all()
    assert len(initial_tokens) == 1
    t1 = initial_tokens[0]
    assert t1.is_revoked is False
    family = t1.token_family

    # Perform refresh with CSRF header
    refresh_resp = client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-TOKEN": csrf_refresh},
    )
    assert refresh_resp.status_code == 200

    # Old token must now be revoked
    db_session.refresh(t1)
    assert t1.is_revoked is True

    # New token created in same family
    all_tokens = RefreshToken.query.filter_by(user_id=user.id).all()
    assert len(all_tokens) == 2
    active_tokens = [t for t in all_tokens if not t.is_revoked]
    assert len(active_tokens) == 1
    assert active_tokens[0].token_family == family


def test_stolen_token_reuse_detection(client, db_session):
    """
    Stolen-token-reuse detection per §6:
    Reusing an already-rotated token revokes the ENTIRE token family!
    """
    user = User(
        full_name="Victim User",
        phone_number="+919876500010",
    )
    user.set_password("Password123!")
    db_session.add(user)
    db_session.commit()

    login_resp = client.post("/api/auth/login", json={
        "identifier": "+919876500010",
        "password": "Password123!",
    })
    csrf_refresh = login_resp.get_json()["csrf_refresh_token"]

    # Save original cookies (to simulate attacker having old token)
    original_refresh_cookie = client.get_cookie("refresh_token_cookie").value

    # Legitimate user refreshes token (rotates t1 -> t2)
    client.post("/api/auth/refresh", headers={"X-CSRF-TOKEN": csrf_refresh})

    # Now attacker attempts to use the original (already rotated) refresh cookie
    client.set_cookie("refresh_token_cookie", original_refresh_cookie)
    client.set_cookie("csrf_refresh_token", csrf_refresh)

    attacker_resp = client.post(
        "/api/auth/refresh",
        headers={"X-CSRF-TOKEN": csrf_refresh},
    )
    assert attacker_resp.status_code == 401
    data = attacker_resp.get_json()
    assert data["error"] == "token_reused"

    # Verify that ALL tokens in this family are now revoked!
    all_tokens = RefreshToken.query.filter_by(user_id=user.id).all()
    assert len(all_tokens) >= 2
    assert all(t.is_revoked for t in all_tokens)


def test_logout_single_session(client, db_session):
    """Logout invalidates the current refresh session and clears cookies."""
    user = User(
        full_name="Logout User",
        phone_number="+919876500011",
    )
    user.set_password("Password123!")
    db_session.add(user)
    db_session.commit()

    login_resp = client.post("/api/auth/login", json={
        "identifier": "+919876500011",
        "password": "Password123!",
    })
    assert login_resp.status_code == 200

    token_record = RefreshToken.query.filter_by(user_id=user.id, is_revoked=False).first()
    assert token_record is not None

    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    db_session.refresh(token_record)
    assert token_record.is_revoked is True


def test_logout_all_sessions(client, db_session):
    """Logout-all revokes all sessions across all devices for the user."""
    user = User(
        full_name="MultiDevice User",
        phone_number="+919876500012",
    )
    user.set_password("Password123!")
    db_session.add(user)
    db_session.commit()

    # Login device 1
    resp1 = client.post("/api/auth/login", json={
        "identifier": "+919876500012",
        "password": "Password123!",
    })
    csrf_access = resp1.get_json()["csrf_token"]

    # Simulate device 2 directly in DB
    db_session.add(RefreshToken(
        user_id=user.id,
        token_hash="device2_jti",
        token_family=str(uuid.uuid4()),
        expires_at=user.created_at,
        is_revoked=False,
    ))
    db_session.commit()

    assert RefreshToken.query.filter_by(user_id=user.id, is_revoked=False).count() == 2

    # Logout all devices
    logout_resp = client.post(
        "/api/auth/logout-all",
        headers={"X-CSRF-TOKEN": csrf_access},
    )
    assert logout_resp.status_code == 200

    # All sessions revoked
    assert RefreshToken.query.filter_by(user_id=user.id, is_revoked=False).count() == 0


def test_get_me_endpoint(client, db_session):
    """GET /api/auth/me returns current user re-verified from DB."""
    user = User(
        full_name="Me Tester",
        phone_number="+919876500013",
        email="me@example.com",
    )
    user.set_password("Password123!")
    db_session.add(user)
    db_session.commit()

    client.post("/api/auth/login", json={
        "identifier": "+919876500013",
        "password": "Password123!",
    })

    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["user"]["full_name"] == "Me Tester"
    assert data["user"]["email"] == "me@example.com"


def test_step_up_auth_and_decorator(client, db_session):
    """
    Test step-up password confirmation endpoint and @require_step_up_auth decorator per §6 & §7.
    """
    user = User(
        full_name="Privileged Actor",
        phone_number="+919876500014",
    )
    user.set_password("SuperSecret123!")
    db_session.add(user)
    db_session.commit()

    login_resp = client.post("/api/auth/login", json={
        "identifier": "+919876500014",
        "password": "SuperSecret123!",
    })
    csrf = login_resp.get_json()["csrf_token"]

    # 1. Test POST /api/auth/verify-password
    # Correct password
    vp_resp = client.post(
        "/api/auth/verify-password",
        json={"password": "SuperSecret123!"},
        headers={"X-CSRF-TOKEN": csrf},
    )
    assert vp_resp.status_code == 200
    assert vp_resp.get_json()["valid"] is True

    # Wrong password
    vp_wrong = client.post(
        "/api/auth/verify-password",
        json={"password": "WrongPassword"},
        headers={"X-CSRF-TOKEN": csrf},
    )
    assert vp_wrong.status_code == 401
    assert vp_wrong.get_json()["valid"] is False

    # 2. Test @require_step_up_auth decorator via /api/auth/step-up-test
    # Calling sensitive route without step-up password -> 401
    resp_no_pw = client.post(
        "/api/auth/step-up-test",
        json={"some_data": 123},
        headers={"X-CSRF-TOKEN": csrf},
    )
    assert resp_no_pw.status_code == 401
    assert resp_no_pw.get_json()["error"] == "step_up_auth_required"

    # Calling with invalid step-up password -> 401
    resp_bad_pw = client.post(
        "/api/auth/step-up-test",
        json={"some_data": 123, "step_up_password": "WrongPassword"},
        headers={"X-CSRF-TOKEN": csrf},
    )
    assert resp_bad_pw.status_code == 401

    # Calling with correct step-up password -> 200
    resp_ok = client.post(
        "/api/auth/step-up-test",
        json={"some_data": 123, "step_up_password": "SuperSecret123!"},
        headers={"X-CSRF-TOKEN": csrf},
    )
    assert resp_ok.status_code == 200
    assert resp_ok.get_json()["success"] is True
