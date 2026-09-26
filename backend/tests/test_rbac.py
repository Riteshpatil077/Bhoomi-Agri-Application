"""
Bhoomi — RBAC Test Suite (Prompt 4)
Covers §7: platform_role_required, permission_required decorators,
admin/super_admin blueprint endpoints, and create-super-admin CLI command.

Success criteria per blueprint §14:
  - 403 on unauthorized role
  - 403 on missing permission grant
  - 200/201 when role + grant correct
  - Self-promotion protection (role escalation via API is not possible)
  - Self-deactivation protection
  - Idempotent permission grant
  - Audit log entry created on sensitive actions
"""
from __future__ import annotations

import json
import uuid
import pytest


# --------------------------------------------------------------------------- #
# Helper fixtures                                                               #
# --------------------------------------------------------------------------- #

def _register_and_login(client, phone: str, password: str = "Secure@1234",
                        name: str = "Test User") -> tuple:
    """Register a user via API and log in; return (response, csrf_token)."""
    client.post(
        "/api/auth/register",
        json={"full_name": name, "phone_number": phone,
              "password": password, "user_type": "farmer"},
        content_type="application/json",
    )
    return _login(client, phone, password)


def _login(client, identifier: str, password: str = "Admin@1234") -> tuple:
    """
    Log in using the 'identifier' field (phone or email) per LoginSchema.
    Returns (response, csrf_token).
    """
    resp = client.post(
        "/api/auth/login",
        json={"identifier": identifier, "password": password},
        content_type="application/json",
    )
    assert resp.status_code == 200, f"Login failed ({identifier}): {resp.data}"
    csrf = resp.get_json().get("csrf_token", "")
    return resp, csrf


def _make_admin(app, phone: str, password: str = "Admin@1234",
                platform_role: str = "admin") -> "User":
    """Directly insert an admin/super_admin User in the DB."""
    from app.extensions import db
    from app.models.user import User

    with app.app_context():
        existing = User.query.filter_by(phone_number=phone).first()
        if existing:
            db.session.refresh(existing)
            db.session.expunge(existing)
            return existing

        u = User(
            id=uuid.uuid4(),
            full_name="Admin User",
            phone_number=phone,
            email=f"admin_{phone}@bhoomi.test",
            platform_role=platform_role,
            user_type=None,
            is_phone_verified=True,
            is_active=True,
        )
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        db.session.refresh(u)
        db.session.expunge(u)
        return u


def _fresh_client(app):
    """Return a fresh test client with no cookies/session."""
    return app.test_client()


# --------------------------------------------------------------------------- #
# 1. Decorator: platform_role_required                                          #
# --------------------------------------------------------------------------- #

class TestPlatformRoleRequired:
    """Unit-level tests for the platform_role_required decorator."""

    def test_regular_user_cannot_access_admin_endpoint(self, app, db_session):
        """A user with platform_role='user' gets 403 on admin endpoints."""
        phone = "9800000011"
        with _fresh_client(app) as c:
            _, csrf = _register_and_login(c, phone)
            resp = c.get(
                "/api/admin/me/permissions",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "forbidden"

    def test_admin_can_access_admin_endpoint(self, app, db_session):
        """An admin user (platform_role='admin') can reach admin endpoints."""
        phone = "9800000012"
        _make_admin(app, phone, platform_role="admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, phone)
            resp = c.get(
                "/api/admin/me/permissions",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 200

    def test_super_admin_can_access_admin_endpoint(self, app, db_session):
        """super_admin can reach admin endpoints as well."""
        phone = "9800000013"
        _make_admin(app, phone, platform_role="super_admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, phone)
            resp = c.get(
                "/api/admin/me/permissions",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 200
        assert resp.get_json()["implicit_super_admin"] is True

    def test_unauthenticated_gets_401(self, app):
        """No JWT → 401."""
        with _fresh_client(app) as c:
            resp = c.get("/api/admin/me/permissions")
        # Fresh client has no cookie — JWT missing → 401
        assert resp.status_code == 401

    def test_user_cannot_access_super_admin_endpoint(self, app, db_session):
        """Regular user always gets 403 on super-admin endpoints."""
        phone = "9800000014"
        with _fresh_client(app) as c:
            _, csrf = _register_and_login(c, phone)
            resp = c.get(
                "/api/super-admin/admins",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 403

    def test_admin_cannot_access_super_admin_endpoint(self, app, db_session):
        """Admin (not super_admin) gets 403 on super-admin routes."""
        phone = "9800000015"
        _make_admin(app, phone, platform_role="admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, phone)
            resp = c.get(
                "/api/super-admin/admins",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# 2. Decorator: permission_required                                             #
# --------------------------------------------------------------------------- #

class TestPermissionRequired:
    """Tests for the permission_required decorator checking AdminPermissionGrant."""

    def test_admin_without_grant_gets_403(self, app, db_session):
        """Admin with no grants on 'user_reports' gets 403."""
        phone = "9800010011"
        _make_admin(app, phone, platform_role="admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, phone)
            resp = c.get(
                "/api/admin/users",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 403
        data = resp.get_json()
        assert data["error"] == "permission_denied"
        assert "user_reports" in data["required_permission"]

    def test_admin_with_grant_gets_200(self, app, db_session):
        """Admin WITH active 'user_reports' grant can list users."""
        from app.extensions import db
        from app.models.admin import AdminPermissionGrant

        phone = "9800010012"
        with app.app_context():
            admin = _make_admin(app, phone, platform_role="admin")
            grant = AdminPermissionGrant(
                admin_user_id=admin.id,
                permission_key="user_reports",
                granted_by=admin.id,
            )
            db.session.add(grant)
            db.session.commit()

        with _fresh_client(app) as c:
            _, csrf = _login(c, phone)
            resp = c.get(
                "/api/admin/users",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 200
        assert "users" in resp.get_json()

    def test_revoked_grant_gives_403(self, app, db_session):
        """A revoked grant must NOT pass the permission check."""
        from app.extensions import db
        from app.models.admin import AdminPermissionGrant
        from datetime import datetime, timezone

        phone = "9800010013"
        with app.app_context():
            admin = _make_admin(app, phone, platform_role="admin")
            grant = AdminPermissionGrant(
                admin_user_id=admin.id,
                permission_key="user_reports",
                granted_by=admin.id,
                revoked_at=datetime.now(timezone.utc),
                revoked_by=admin.id,
            )
            db.session.add(grant)
            db.session.commit()

        with _fresh_client(app) as c:
            _, csrf = _login(c, phone)
            resp = c.get(
                "/api/admin/users",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 403

    def test_super_admin_bypasses_grant_check(self, app, db_session):
        """Super Admin gets 200 on permission-gated endpoint with NO grants."""
        phone = "9800010014"
        _make_admin(app, phone, platform_role="super_admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, phone)
            resp = c.get(
                "/api/admin/users",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 200


# --------------------------------------------------------------------------- #
# 3. Super Admin — admin account management                                     #
# --------------------------------------------------------------------------- #

class TestSuperAdminAccountManagement:
    """Tests for /api/super-admin/admins endpoints."""

    def test_create_admin_account(self, app, db_session):
        """Super Admin can create a new admin account."""
        _make_admin(app, "9900001011", platform_role="super_admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900001011")
            resp = c.post(
                "/api/super-admin/admins",
                json={
                    "full_name": "New Admin",
                    "phone_number": "8800000011",
                    "email": "newadmin1@bhoomi.test",
                    "password": "AdminPass1",
                    "platform_role": "admin",
                },
                headers={"X-CSRF-TOKEN": csrf},
                content_type="application/json",
            )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["user"]["platform_role"] == "admin"
        assert data["user"]["phone_number"] == "8800000011"

    def test_create_admin_duplicate_phone_rejected(self, app, db_session):
        """Duplicate phone yields 409."""
        _make_admin(app, "9900001012", platform_role="super_admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900001012")
            headers = {"X-CSRF-TOKEN": csrf, "Content-Type": "application/json"}
            phone = "8800000012"
            c.post(
                "/api/super-admin/admins",
                json={"full_name": "A1", "phone_number": phone, "password": "AdminPass1",
                      "platform_role": "admin"},
                headers=headers,
            )
            resp = c.post(
                "/api/super-admin/admins",
                json={"full_name": "A2", "phone_number": phone, "password": "AdminPass1",
                      "platform_role": "admin"},
                headers=headers,
            )
        assert resp.status_code == 409

    def test_cannot_create_user_role_via_super_admin(self, app, db_session):
        """platform_role='user' is rejected — endpoint only allows admin/super_admin."""
        _make_admin(app, "9900001013", platform_role="super_admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900001013")
            resp = c.post(
                "/api/super-admin/admins",
                json={"full_name": "Bad", "phone_number": "8800000013",
                      "password": "AdminPass1", "platform_role": "user"},
                headers={"X-CSRF-TOKEN": csrf},
                content_type="application/json",
            )
        assert resp.status_code == 422

    def test_deactivate_admin(self, app, db_session):
        """Super Admin can deactivate an admin account."""
        _make_admin(app, "9900001014", platform_role="super_admin")
        target = _make_admin(app, "8800000014", platform_role="admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900001014")
            resp = c.patch(
                f"/api/super-admin/admins/{target.id}/deactivate",
                json={"reason": "Testing deactivation"},
                headers={"X-CSRF-TOKEN": csrf},
                content_type="application/json",
            )
        assert resp.status_code == 200
        assert resp.get_json()["user"]["is_active"] is False

    def test_super_admin_cannot_deactivate_self(self, app, db_session):
        """Self-deactivation returns 403."""
        sa = _make_admin(app, "9900001015", platform_role="super_admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900001015")
            resp = c.patch(
                f"/api/super-admin/admins/{sa.id}/deactivate",
                headers={"X-CSRF-TOKEN": csrf},
                content_type="application/json",
            )
        assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# 4. Super Admin — permission grant management                                  #
# --------------------------------------------------------------------------- #

class TestPermissionGrantManagement:
    """Tests for /api/super-admin/admins/<id>/permissions endpoints."""

    def test_grant_permission(self, app, db_session):
        """Super Admin can grant a permission to an admin."""
        _make_admin(app, "9900002011", platform_role="super_admin")
        target = _make_admin(app, "8800002011", platform_role="admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900002011")
            resp = c.post(
                f"/api/super-admin/admins/{target.id}/permissions",
                json={"permission_key": "verification_review"},
                headers={"X-CSRF-TOKEN": csrf},
                content_type="application/json",
            )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["grant"]["permission_key"] == "verification_review"
        assert data["grant"]["is_active"] is True

    def test_grant_idempotent(self, app, db_session):
        """Granting the same permission twice returns 200, not 201."""
        _make_admin(app, "9900002012", platform_role="super_admin")
        target = _make_admin(app, "8800002012", platform_role="admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900002012")
            url = f"/api/super-admin/admins/{target.id}/permissions"
            payload = {"permission_key": "content_moderation"}
            headers = {"X-CSRF-TOKEN": csrf, "Content-Type": "application/json"}
            resp1 = c.post(url, json=payload, headers=headers)
            assert resp1.status_code == 201
            resp2 = c.post(url, json=payload, headers=headers)
        assert resp2.status_code == 200
        assert resp2.get_json()["message"] == "Permission already active."

    def test_revoke_permission(self, app, db_session):
        """Super Admin can revoke a permission grant."""
        from app.extensions import db
        from app.models.admin import AdminPermissionGrant

        _make_admin(app, "9900002013", platform_role="super_admin")
        target = _make_admin(app, "8800002013", platform_role="admin")

        with app.app_context():
            grant = AdminPermissionGrant(
                admin_user_id=target.id,
                permission_key="user_reports",
                granted_by=target.id,
            )
            db.session.add(grant)
            db.session.commit()

        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900002013")
            resp = c.delete(
                f"/api/super-admin/admins/{target.id}/permissions/user_reports",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["grant"]["is_active"] is False
        assert data["grant"]["revoked_at"] is not None

    def test_revoke_nonexistent_permission_returns_404(self, app, db_session):
        """Revoking a permission that doesn't exist returns 404."""
        _make_admin(app, "9900002014", platform_role="super_admin")
        target = _make_admin(app, "8800002014", platform_role="admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900002014")
            resp = c.delete(
                f"/api/super-admin/admins/{target.id}/permissions/nonexistent_perm",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 404

    def test_list_admin_permissions(self, app, db_session):
        """GET permissions endpoint returns all grants for an admin."""
        from app.extensions import db
        from app.models.admin import AdminPermissionGrant

        _make_admin(app, "9900002015", platform_role="super_admin")
        target = _make_admin(app, "8800002015", platform_role="admin")

        with app.app_context():
            for perm in ["verification_review", "user_reports"]:
                db.session.add(AdminPermissionGrant(
                    admin_user_id=target.id,
                    permission_key=perm,
                    granted_by=target.id,
                ))
            db.session.commit()

        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900002015")
            resp = c.get(
                f"/api/super-admin/admins/{target.id}/permissions",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["active_permissions"]) >= 2
        assert "verification_review" in data["active_permissions"]
        assert "user_reports" in data["active_permissions"]


# --------------------------------------------------------------------------- #
# 5. Admin cannot escalate privileges                                           #
# --------------------------------------------------------------------------- #

class TestPrivilegeEscalation:
    """Verify no API endpoint allows a user to escalate their own platform_role."""

    def test_registration_cannot_set_platform_role(self, app, db_session):
        """RegisterSchema must strip platform_role from the request body."""
        with _fresh_client(app) as c:
            resp = c.post(
                "/api/auth/register",
                json={
                    "full_name": "Hacker",
                    "phone_number": "7700000011",
                    "password": "HackMe123",
                    "user_type": "farmer",
                    "platform_role": "super_admin",  # should be stripped
                },
                content_type="application/json",
            )
        assert resp.status_code == 201
        with app.app_context():
            from app.models.user import User
            u = User.query.filter_by(phone_number="7700000011").first()
            assert u is not None
            assert u.platform_role == "user"  # escalation blocked

    def test_admin_cannot_deactivate_super_admin(self, app, db_session):
        """Plain admin cannot deactivate a super_admin account."""
        from app.extensions import db
        from app.models.admin import AdminPermissionGrant

        admin = _make_admin(app, "7700000012", platform_role="admin")
        sa = _make_admin(app, "7700000013", platform_role="super_admin")

        with app.app_context():
            db.session.add(AdminPermissionGrant(
                admin_user_id=admin.id,
                permission_key="user_reports",
                granted_by=sa.id,
            ))
            db.session.commit()

        with _fresh_client(app) as c:
            _, csrf = _login(c, "7700000012")
            resp = c.patch(
                f"/api/admin/users/{sa.id}/deactivate",
                json={"reason": "Trying to deactivate SA"},
                headers={"X-CSRF-TOKEN": csrf},
                content_type="application/json",
            )
        assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# 6. Audit log endpoint                                                         #
# --------------------------------------------------------------------------- #

class TestAuditLog:
    """Tests for /api/super-admin/audit-logs."""

    def test_super_admin_can_view_audit_logs(self, app, db_session):
        """Super Admin gets 200 from audit logs endpoint."""
        _make_admin(app, "9900003011", platform_role="super_admin")
        with _fresh_client(app) as c:
            _, csrf = _login(c, "9900003011")
            resp = c.get(
                "/api/super-admin/audit-logs",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "audit_logs" in data
        assert "total" in data

    def test_regular_user_cannot_view_audit_logs(self, app, db_session):
        """Regular user gets 403 on audit logs."""
        with _fresh_client(app) as c:
            _, csrf = _register_and_login(c, "9900003012")
            resp = c.get(
                "/api/super-admin/audit-logs",
                headers={"X-CSRF-TOKEN": csrf},
            )
        assert resp.status_code == 403

    def test_audit_log_created_on_deactivation(self, app, db_session):
        """Deactivating an admin creates an audit log entry."""
        from app.models.audit import AuditLog

        sa_phone = "9900003013"
        _make_admin(app, sa_phone, platform_role="super_admin")
        target = _make_admin(app, "8800003011", platform_role="admin")

        with app.app_context():
            initial_count = AuditLog.query.count()

        with _fresh_client(app) as c:
            _, csrf = _login(c, sa_phone)
            resp = c.patch(
                f"/api/super-admin/admins/{target.id}/deactivate",
                json={"reason": "Audit test"},
                headers={"X-CSRF-TOKEN": csrf},
                content_type="application/json",
            )
        assert resp.status_code == 200

        with app.app_context():
            assert AuditLog.query.count() > initial_count
            log = AuditLog.query.filter_by(
                action="deactivate_admin_account",
                resource_id=str(target.id),
            ).first()
            assert log is not None
            assert log.reason == "Audit test"


# --------------------------------------------------------------------------- #
# 7. create-super-admin CLI                                                     #
# --------------------------------------------------------------------------- #

class TestCreateSuperAdminCLI:
    """Tests for the flask create-super-admin CLI command."""

    def _clear_super_admins(self, app) -> None:
        """Remove all super_admin users so CLI can run."""
        from app.extensions import db
        from app.models.user import User
        with app.app_context():
            User.query.filter_by(platform_role="super_admin").delete()
            db.session.commit()

    def test_cli_creates_super_admin(self, app):
        """CLI creates a super_admin user when none exists."""
        from click.testing import CliRunner
        from app.models.user import User

        self._clear_super_admins(app)

        runner = CliRunner()
        with app.app_context():
            result = runner.invoke(
                app.cli,
                [
                    "create-super-admin",
                    "--name", "CLI Super Admin",
                    "--email", "clisa@bhoomi.test",
                    "--phone", "9950000011",
                    "--password", "SuperPass1",
                ],
                catch_exceptions=False,
            )
            assert result.exit_code == 0, result.output
            assert "Super Admin created successfully" in result.output

            u = User.query.filter_by(phone_number="9950000011").first()
            assert u is not None
            assert u.platform_role == "super_admin"
            assert u.is_active is True
            assert u.is_phone_verified is True

    def test_cli_refuses_second_super_admin(self, app):
        """CLI aborts when a super_admin already exists."""
        from click.testing import CliRunner
        from app.models.user import User

        # Ensure a super_admin exists (created by test_cli_creates_super_admin or inline)
        with app.app_context():
            existing = User.query.filter_by(platform_role="super_admin").first()
            if not existing:
                _make_admin(app, "9950000099", platform_role="super_admin")

        runner = CliRunner()
        with app.app_context():
            result = runner.invoke(
                app.cli,
                [
                    "create-super-admin",
                    "--name", "Second SA",
                    "--email", "second@bhoomi.test",
                    "--phone", "9950000012",
                    "--password", "SuperPass2",
                ],
            )
        assert result.exit_code != 0
        output = result.output or ""
        assert "already exists" in output

    def test_cli_rejects_short_password(self, app):
        """CLI rejects passwords shorter than 8 characters."""
        from click.testing import CliRunner

        self._clear_super_admins(app)

        runner = CliRunner()
        with app.app_context():
            result = runner.invoke(
                app.cli,
                [
                    "create-super-admin",
                    "--name", "Short PW",
                    "--email", "short@bhoomi.test",
                    "--phone", "9950000013",
                    "--password", "short",
                ],
            )
        assert result.exit_code != 0
