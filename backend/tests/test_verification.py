"""
Bhoomi — Farmer Verification Test Suite (Prompt 5)
Covers §5 (Farmer Verification, S3 presigned URLs, secure storage, and retention purge),
§7 (verification_review permission gating on Admin and Super Admin), and §9 (audit logs).

Success criteria per Prompt 5:
  1. unverified user blocked from farmer-only endpoints
  2. Admin with the grant can review
  3. Admin without the grant gets 403
  4. Super Admin without the grant also gets 403
  5. purge job deletes expired docs
  6. every document view produces an audit row with a reason
"""
from __future__ import annotations

import uuid
from datetime import timedelta
import pytest

from app.models.base import utc_now


# --------------------------------------------------------------------------- #
# Test Fixtures & Helpers                                                     #
# --------------------------------------------------------------------------- #

def _create_user(app, phone: str, password: str = "Secure@1234",
                 platform_role: str = "user", user_type: str = "farmer",
                 verification_status: str = "unverified") -> "User":
    """Create a test user in DB and return detached instance with loaded attributes."""
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
            full_name=f"User {phone}",
            phone_number=phone,
            email=f"user_{phone}@bhoomi.test",
            platform_role=platform_role,
            user_type=user_type,
            verification_status=verification_status,
            is_phone_verified=True,
            is_active=True,
        )
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        db.session.refresh(u)
        db.session.expunge(u)
        return u


def _login(client, identifier: str, password: str = "Secure@1234") -> tuple:
    """Log in and return (response, csrf_token)."""
    resp = client.post(
        "/api/auth/login",
        json={"identifier": identifier, "password": password},
        content_type="application/json",
    )
    assert resp.status_code == 200, f"Login failed for {identifier}: {resp.data}"
    csrf = resp.get_json().get("csrf_token", "")
    return resp, csrf


def _grant_permission(app, admin_id: uuid.UUID, permission_key: str = "verification_review",
                      granted_by: uuid.UUID | None = None) -> "AdminPermissionGrant":
    """Directly insert an active AdminPermissionGrant."""
    from app.extensions import db
    from app.models.admin import AdminPermissionGrant

    with app.app_context():
        grant = AdminPermissionGrant(
            id=uuid.uuid4(),
            admin_user_id=admin_id,
            permission_key=permission_key,
            granted_by=granted_by or admin_id,
        )
        db.session.add(grant)
        db.session.commit()
        db.session.refresh(grant)
        db.session.expunge(grant)
        return grant


# --------------------------------------------------------------------------- #
# 1. Presigned Upload URL Generation                                          #
# --------------------------------------------------------------------------- #

class TestPresignedUploadUrl:
    """Tests for POST /api/verification/upload-url."""

    def test_authenticated_user_can_get_upload_url(self, app, client):
        phone = "9700000001"
        user = _create_user(app, phone)
        _, csrf = _login(client, phone)

        resp = client.post(
            "/api/verification/upload-url",
            json={
                "photo_type": "selfie",
                "content_type": "image/jpeg",
                "file_size_bytes": 2 * 1024 * 1024,
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "upload_url" in data
        assert "object_key" in data
        assert data["object_key"].startswith(f"verifications/{user.id}/selfie_")
        assert data["expires_in"] == 300

    def test_upload_url_rejects_disallowed_content_type(self, app, client):
        phone = "9700000002"
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        resp = client.post(
            "/api/verification/upload-url",
            json={
                "photo_type": "land",
                "content_type": "application/pdf",  # disallowed
                "file_size_bytes": 1024,
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 422
        assert "content_type" in resp.get_json()["messages"]

    def test_upload_url_rejects_oversized_file(self, app, client):
        phone = "9700000003"
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        resp = client.post(
            "/api/verification/upload-url",
            json={
                "photo_type": "land",
                "content_type": "image/png",
                "file_size_bytes": 15 * 1024 * 1024,  # > 10MB limit
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 422
        assert "file_size_bytes" in resp.get_json()["messages"]


# --------------------------------------------------------------------------- #
# 2. Verification Submission & Status                                         #
# --------------------------------------------------------------------------- #

class TestVerificationSubmission:
    """Tests for POST /api/verification/submit and GET /api/verification/status."""

    def test_submit_verification_success(self, app, client):
        phone = "9700000010"
        user = _create_user(app, phone)
        _, csrf = _login(client, phone)

        selfie_key = f"verifications/{user.id}/selfie_123.jpg"
        land_key = f"verifications/{user.id}/land_456.jpg"

        resp = client.post(
            "/api/verification/submit",
            json={
                "selfie_photo_key": selfie_key,
                "land_photo_key": land_key,
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 201
        data = resp.get_json()["verification"]
        assert data["status"] == "pending"
        assert data["user_id"] == str(user.id)

        # Check status endpoint reflects pending status
        status_resp = client.get("/api/verification/status", headers={"X-CSRF-TOKEN": csrf})
        assert status_resp.status_code == 200
        status_data = status_resp.get_json()
        assert status_data["verification_status"] == "pending"
        assert status_data["application"]["status"] == "pending"

    def test_submit_rejects_other_users_object_keys(self, app, client):
        """Cross-user key submission must be blocked (ownership check §5, §9)."""
        phone = "9700000011"
        other_user_id = uuid.uuid4()
        _create_user(app, phone)
        _, csrf = _login(client, phone)

        resp = client.post(
            "/api/verification/submit",
            json={
                "selfie_photo_key": f"verifications/{other_user_id}/selfie_abc.jpg",
                "land_photo_key": f"verifications/{other_user_id}/land_def.jpg",
            },
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "invalid_object_key"


# --------------------------------------------------------------------------- #
# 3. Farmer-Only Endpoint Protection                                          #
# --------------------------------------------------------------------------- #

class TestFarmerOnlyEndpointProtection:
    """Prompt 5 requirement: unverified user blocked from farmer-only endpoints."""

    def test_unverified_farmer_blocked_from_farmer_only_endpoint(self, app, client):
        phone = "9700000020"
        _create_user(app, phone, user_type="farmer", verification_status="unverified")
        _, csrf = _login(client, phone)

        resp = client.get("/api/verification/farmer-only-test", headers={"X-CSRF-TOKEN": csrf})
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "verification_required"

    def test_pending_farmer_blocked_from_farmer_only_endpoint(self, app, client):
        phone = "9700000021"
        _create_user(app, phone, user_type="farmer", verification_status="pending")
        _, csrf = _login(client, phone)

        resp = client.get("/api/verification/farmer-only-test", headers={"X-CSRF-TOKEN": csrf})
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "verification_required"

    def test_verified_farmer_allowed_access(self, app, client):
        phone = "9700000022"
        _create_user(app, phone, user_type="farmer", verification_status="verified")
        _, csrf = _login(client, phone)

        resp = client.get("/api/verification/farmer-only-test", headers={"X-CSRF-TOKEN": csrf})
        assert resp.status_code == 200
        assert resp.get_json()["message"] == "Welcome to the farmer-only resource."

    def test_verified_non_farmer_blocked_from_farmer_only_endpoint(self, app, client):
        phone = "9700000023"
        _create_user(app, phone, user_type="buyer", verification_status="verified")
        _, csrf = _login(client, phone)

        resp = client.get("/api/verification/farmer-only-test", headers={"X-CSRF-TOKEN": csrf})
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "forbidden"


# --------------------------------------------------------------------------- #
# 4. RBAC Permission Gating: Admin & Super Admin                              #
# --------------------------------------------------------------------------- #

class TestVerificationReviewRBACGating:
    """
    Prompt 5 requirements:
      - Admin with the grant can review
      - Admin without the grant gets 403
      - Super Admin without the grant also gets 403
    """

    def _setup_pending_verification(self, app) -> "FarmerVerification":
        from app.extensions import db
        from app.models.verification import FarmerVerification

        farmer = _create_user(app, f"97000{uuid.uuid4().hex[:5]}", user_type="farmer")
        with app.app_context():
            ver = FarmerVerification(
                id=uuid.uuid4(),
                user_id=farmer.id,
                selfie_photo_key=f"verifications/{farmer.id}/selfie_test.jpg",
                land_photo_key=f"verifications/{farmer.id}/land_test.jpg",
                status="pending",
            )
            db.session.add(ver)
            db.session.commit()
            db.session.refresh(ver)
            db.session.expunge(ver)
            return ver

    def test_admin_without_grant_gets_403_on_applications(self, app, client):
        """Admin without verification_review grant gets 403."""
        phone = "9700000030"
        _create_user(app, phone, platform_role="admin")
        _, csrf = _login(client, phone)

        resp = client.get("/api/verification/applications", headers={"X-CSRF-TOKEN": csrf})
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "permission_denied"

    def test_admin_without_grant_gets_403_on_review(self, app, client):
        """Admin without grant gets 403 when trying to review."""
        phone = "9700000031"
        _create_user(app, phone, platform_role="admin")
        _, csrf = _login(client, phone)

        ver = self._setup_pending_verification(app)
        resp = client.post(
            f"/api/verification/applications/{ver.id}/review",
            json={"decision": "verified"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "permission_denied"

    def test_super_admin_without_grant_also_gets_403(self, app, client):
        """
        Per §5 and §7.4: A bare Super Admin role does NOT unlock verification documents
        or reviews without an active verification_review grant.
        """
        phone = "9700000032"
        _create_user(app, phone, platform_role="super_admin")
        _, csrf = _login(client, phone)

        ver = self._setup_pending_verification(app)

        # 1. Applications listing
        resp1 = client.get("/api/verification/applications", headers={"X-CSRF-TOKEN": csrf})
        assert resp1.status_code == 403
        assert resp1.get_json()["error"] == "permission_denied"

        # 2. Document photo view
        resp2 = client.post(
            f"/api/verification/applications/{ver.id}/photos/url",
            json={"photo_type": "selfie", "reason": "Super Admin inspection"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp2.status_code == 403
        assert resp2.get_json()["error"] == "permission_denied"

        # 3. Review decision
        resp3 = client.post(
            f"/api/verification/applications/{ver.id}/review",
            json={"decision": "verified"},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp3.status_code == 403
        assert resp3.get_json()["error"] == "permission_denied"

    def test_admin_with_grant_can_list_and_review(self, app, client):
        """Admin with active verification_review grant can review successfully."""
        phone = "9700000033"
        admin = _create_user(app, phone, platform_role="admin")
        _grant_permission(app, admin.id, "verification_review")
        _, csrf = _login(client, phone)

        ver = self._setup_pending_verification(app)

        # 1. List applications
        resp = client.get("/api/verification/applications", headers={"X-CSRF-TOKEN": csrf})
        assert resp.status_code == 200
        assert resp.get_json()["total"] >= 1

        # 2. Review application (verify)
        review_resp = client.post(
            f"/api/verification/applications/{ver.id}/review",
            json={"decision": "verified", "reason": "Valid land documents confirmed."},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert review_resp.status_code == 200
        updated = review_resp.get_json()["verification"]
        assert updated["status"] == "verified"
        assert updated["reviewed_by"] == str(admin.id)
        assert updated["docs_purge_at"] is not None

        # Check farmer's user record was updated to verified
        from app.models.user import User
        with app.app_context():
            farmer_user = User.query.get(ver.user_id)
            assert farmer_user.verification_status == "verified"

    def test_review_rejection_requires_reason(self, app, client):
        """Rejecting verification without reason is rejected by schema (422)."""
        phone = "9700000034"
        admin = _create_user(app, phone, platform_role="admin")
        _grant_permission(app, admin.id, "verification_review")
        _, csrf = _login(client, phone)

        ver = self._setup_pending_verification(app)
        resp = client.post(
            f"/api/verification/applications/{ver.id}/review",
            json={"decision": "rejected"},  # missing reason
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 422
        assert "reason" in resp.get_json()["messages"]


# --------------------------------------------------------------------------- #
# 5. Document View Reason & Audit Logging                                     #
# --------------------------------------------------------------------------- #

class TestDocumentViewAuditLogging:
    """
    Prompt 5 requirement:
      - every document view produces an audit row with a reason
    """

    def test_document_view_requires_reason(self, app, client):
        """POST /applications/<id>/photos/url without reason returns 422."""
        phone = "9700000040"
        admin = _create_user(app, phone, platform_role="admin")
        _grant_permission(app, admin.id, "verification_review")
        _, csrf = _login(client, phone)

        farmer = _create_user(app, "9700000041")
        from app.extensions import db
        from app.models.verification import FarmerVerification
        with app.app_context():
            ver = FarmerVerification(
                id=uuid.uuid4(),
                user_id=farmer.id,
                selfie_photo_key=f"verifications/{farmer.id}/selfie.jpg",
                land_photo_key=f"verifications/{farmer.id}/land.jpg",
                status="pending",
            )
            db.session.add(ver)
            db.session.commit()
            ver_id = ver.id

        resp = client.post(
            f"/api/verification/applications/{ver_id}/photos/url",
            json={"photo_type": "selfie", "reason": ""},  # empty reason
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 422

    def test_document_view_creates_audit_log_with_reason(self, app, client):
        """Every presigned GET URL request writes an immutable AuditLog row with reason."""
        from app.extensions import db
        from app.models.verification import FarmerVerification
        from app.models.audit import AuditLog

        phone = "9700000042"
        admin = _create_user(app, phone, platform_role="admin")
        _grant_permission(app, admin.id, "verification_review")
        _, csrf = _login(client, phone)

        farmer = _create_user(app, "9700000043")
        with app.app_context():
            ver = FarmerVerification(
                id=uuid.uuid4(),
                user_id=farmer.id,
                selfie_photo_key=f"verifications/{farmer.id}/selfie_audit.jpg",
                land_photo_key=f"verifications/{farmer.id}/land_audit.jpg",
                status="pending",
            )
            db.session.add(ver)
            db.session.commit()
            ver_id = ver.id
            initial_audit_count = AuditLog.query.count()

        reason_str = "Reviewing farmer selfie photo against submitted land record."
        resp = client.post(
            f"/api/verification/applications/{ver_id}/photos/url",
            json={"photo_type": "selfie", "reason": reason_str},
            headers={"X-CSRF-TOKEN": csrf},
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "download_url" in data
        assert data["expires_in"] == 300

        # Verify audit log row
        with app.app_context():
            assert AuditLog.query.count() > initial_audit_count
            log = AuditLog.query.filter_by(
                action="view_verification_document",
                resource_id=str(ver_id),
            ).order_by(AuditLog.created_at.desc()).first()
            assert log is not None
            assert log.actor_user_id == admin.id
            assert log.reason == reason_str
            assert log.metadata_redacted["photo_type"] == "selfie"
            assert log.metadata_redacted["target_user_id"] == str(farmer.id)


# --------------------------------------------------------------------------- #
# 6. Retention Purge Celery Beat Job                                          #
# --------------------------------------------------------------------------- #

class TestRetentionPurgeJob:
    """Prompt 5 requirement: purge job deletes expired docs."""

    def test_purge_job_deletes_expired_docs(self, app):
        """
        purge_expired_verification_docs deletes private S3 objects and sets
        keys to '[PURGED]' when docs_purge_at <= now.
        """
        from app.extensions import db
        from app.models.verification import FarmerVerification
        from app.models.audit import AuditLog
        from app.tasks.verification import purge_expired_verification_docs

        farmer = _create_user(app, "9700000050")
        expired_time = utc_now() - timedelta(days=1)
        future_time = utc_now() + timedelta(days=29)

        with app.app_context():
            # 1. Expired application
            expired_app = FarmerVerification(
                id=uuid.uuid4(),
                user_id=farmer.id,
                selfie_photo_key=f"verifications/{farmer.id}/selfie_old.jpg",
                land_photo_key=f"verifications/{farmer.id}/land_old.jpg",
                status="verified",
                docs_purge_at=expired_time,
            )
            # 2. Non-expired application
            active_app = FarmerVerification(
                id=uuid.uuid4(),
                user_id=farmer.id,
                selfie_photo_key=f"verifications/{farmer.id}/selfie_active.jpg",
                land_photo_key=f"verifications/{farmer.id}/land_active.jpg",
                status="verified",
                docs_purge_at=future_time,
            )
            db.session.add_all([expired_app, active_app])
            db.session.commit()
            expired_id = expired_app.id
            active_id = active_app.id

            # Execute purge task synchronously
            result = purge_expired_verification_docs()
            assert result["status"] == "success"
            assert result["purged_records"] >= 1

            # Verify expired application was purged
            purged = FarmerVerification.query.get(expired_id)
            assert purged.selfie_photo_key == "[PURGED]"
            assert purged.land_photo_key == "[PURGED]"

            # Verify active application was untouched
            unpurged = FarmerVerification.query.get(active_id)
            assert unpurged.selfie_photo_key != "[PURGED]"
            assert unpurged.land_photo_key != "[PURGED]"

            # Verify audit trail for the purge
            purge_log = AuditLog.query.filter_by(
                action="purge_expired_verification_docs",
                resource_id=str(expired_id),
            ).first()
            assert purge_log is not None
            assert purge_log.reason == "Automated retention policy document purge per §5"
