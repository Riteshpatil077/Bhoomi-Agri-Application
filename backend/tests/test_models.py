"""
Prompt 2 — Data Models & Migrations Tests
Verifies all SQLAlchemy models, relationships, field constraints, password hashing,
and RBAC role separation per §4, §5, §6, and §7.
"""
from __future__ import annotations

import uuid
from datetime import datetime, date, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import (
    User,
    AdminPermissionGrant,
    FarmerVerification,
    Farm,
    Plot,
    CropCatalog,
    CropCycle,
    FarmActivity,
    WeatherAdvisory,
    RefreshToken,
    AuditLog,
    utc_now,
)


def test_user_creation_and_role_split(db_session):
    """
    Test user creation with independent user_type and platform_role fields per §4 & §7.
    """
    user = User(
        full_name="Ramesh Patel",
        phone_number="+919876543210",
        email="ramesh@example.com",
        user_type=User.USER_TYPE_FARMER,
        platform_role=User.PLATFORM_ROLE_USER,
        preferred_language="hi",
    )
    user.set_password("SecurePass123!")

    db_session.add(user)
    db_session.commit()

    assert user.id is not None
    assert isinstance(user.id, uuid.UUID)
    assert user.full_name == "Ramesh Patel"
    assert user.phone_number == "+919876543210"
    assert user.email == "ramesh@example.com"
    assert user.user_type == "farmer"
    assert user.platform_role == "user"
    assert user.is_farmer is True
    assert user.is_admin is False
    assert user.is_super_admin is False
    assert user.is_active is True
    assert user.verification_status == "unverified"
    assert user.created_at is not None

    # Password check
    assert user.check_password("SecurePass123!") is True
    assert user.check_password("WrongPassword") is False


def test_user_unique_phone_number_constraint(db_session):
    """Phone number must be unique across all users."""
    u1 = User(
        full_name="User One",
        phone_number="+919999999991",
        password_hash="hash1",
    )
    u2 = User(
        full_name="User Two",
        phone_number="+919999999991",  # Duplicate phone
        password_hash="hash2",
    )
    db_session.add(u1)
    db_session.commit()

    db_session.add(u2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_admin_permission_grant_workflow(db_session):
    """
    Test AdminPermissionGrant model:
    Super Admin grants permission to Admin, and revokes it per §4 & §7.
    """
    super_admin = User(
        full_name="Chief Admin",
        phone_number="+919800000001",
        email="super@bhoomi.internal",
        platform_role=User.PLATFORM_ROLE_SUPER_ADMIN,
        password_hash="hash",
    )
    admin = User(
        full_name="Ops Admin",
        phone_number="+919800000002",
        email="ops@bhoomi.internal",
        platform_role=User.PLATFORM_ROLE_ADMIN,
        password_hash="hash",
    )
    db_session.add_all([super_admin, admin])
    db_session.commit()

    assert super_admin.is_super_admin is True
    assert admin.is_admin is True

    # Super Admin grants verification_review permission
    grant = AdminPermissionGrant(
        admin_user_id=admin.id,
        permission_key=AdminPermissionGrant.PERMISSION_VERIFICATION_REVIEW,
        granted_by=super_admin.id,
    )
    db_session.add(grant)
    db_session.commit()

    assert grant.id is not None
    assert grant.is_active is True
    assert grant.revoked_at is None

    # Revoke grant
    grant.revoke(revoker_user_id=super_admin.id)
    db_session.commit()

    assert grant.is_active is False
    assert grant.revoked_at is not None
    assert grant.revoked_by == super_admin.id


def test_farmer_verification_model(db_session):
    """
    Test FarmerVerification: selfie and land photo keys, pending status, reviewer link per §5.
    """
    farmer = User(
        full_name="Sita Devi",
        phone_number="+919811111111",
        user_type=User.USER_TYPE_FARMER,
        password_hash="hash",
    )
    admin = User(
        full_name="Reviewer Admin",
        phone_number="+919822222222",
        platform_role=User.PLATFORM_ROLE_ADMIN,
        password_hash="hash",
    )
    db_session.add_all([farmer, admin])
    db_session.commit()

    purge_date = datetime.now(timezone.utc) + timedelta(days=30)
    verif = FarmerVerification(
        user_id=farmer.id,
        selfie_photo_key="verifications/selfie_123.jpg",
        land_photo_key="verifications/land_123.jpg",
        status=FarmerVerification.STATUS_PENDING,
        docs_purge_at=purge_date,
    )
    db_session.add(verif)
    db_session.commit()

    assert verif.id is not None
    assert verif.status == "pending"
    assert verif.user.full_name == "Sita Devi"
    assert verif.docs_purge_at is not None

    # Admin reviews and approves
    verif.status = FarmerVerification.STATUS_VERIFIED
    verif.reviewed_by = admin.id
    verif.reviewed_at = datetime.now(timezone.utc)
    farmer.verification_status = User.VERIFICATION_STATUS_VERIFIED
    db_session.commit()

    assert verif.status == "verified"
    assert verif.reviewer.full_name == "Reviewer Admin"
    assert farmer.verification_status == "verified"


def test_farm_plot_crop_cycle_activity_hierarchy(db_session):
    """
    Test the full agricultural hierarchy:
    User -> Farm -> Plot -> CropCycle (with CropCatalog) -> FarmActivity
    """
    farmer = User(
        full_name="Kisan Lal",
        phone_number="+919833333333",
        user_type=User.USER_TYPE_FARMER,
        password_hash="hash",
    )
    db_session.add(farmer)
    db_session.commit()

    # 1. Farm
    farm = Farm(
        user_id=farmer.id,
        name="Surya Farm",
        latitude=18.5204,
        longitude=73.8567,
        soil_type="Black Cotton",
    )
    db_session.add(farm)
    db_session.commit()
    assert farm.id is not None

    # 2. Plot
    plot = Plot(
        farm_id=farm.id,
        plot_name="North Field",
        area_acres=2.5,
    )
    db_session.add(plot)
    db_session.commit()
    assert plot.id is not None

    # 3. Crop Catalog
    crop = CropCatalog(
        crop_name="Wheat (Sharbati)",
        category="Cereal",
        typical_duration_days=120,
    )
    db_session.add(crop)
    db_session.commit()

    # 4. Crop Cycle
    cycle = CropCycle(
        plot_id=plot.id,
        crop_catalog_id=crop.id,
        sowing_date=date(2026, 10, 1),
        expected_harvest_date=date(2027, 2, 1),
        status=CropCycle.STATUS_ACTIVE,
    )
    db_session.add(cycle)
    db_session.commit()
    assert cycle.id is not None
    assert cycle.status == "active"

    # 5. Farm Activity
    activity = FarmActivity(
        crop_cycle_id=cycle.id,
        activity_type=FarmActivity.ACTIVITY_IRRIGATION,
        scheduled_date=date(2026, 10, 15),
        notes="First drip irrigation cycle",
    )
    db_session.add(activity)
    db_session.commit()
    assert activity.id is not None
    assert activity.is_completed is False

    # Complete activity
    activity.completed_date = date(2026, 10, 15)
    db_session.commit()
    assert activity.is_completed is True

    # Verify relationships traversal
    assert len(list(farm.plots)) == 1
    assert len(list(plot.crop_cycles)) == 1
    assert len(list(cycle.activities)) == 1
    assert cycle.crop_catalog.crop_name == "Wheat (Sharbati)"


def test_weather_advisory_provenance(db_session):
    """
    Test WeatherAdvisory model with provenance fields per §4 & §8.
    """
    now = datetime.now(timezone.utc)
    advisory = WeatherAdvisory(
        region_code="MH-PUN-01",
        source_name="India Meteorological Department (IMD)",
        data_type=WeatherAdvisory.DATA_TYPE_ADVISORY,
        payload={"advisory": "Light rain expected in next 48 hours. Postpone pesticide spraying.", "rain_prob": 70},
        source_updated_at=now,
        valid_until=now + timedelta(days=2),
    )
    db_session.add(advisory)
    db_session.commit()

    assert advisory.id is not None
    assert advisory.region_code == "MH-PUN-01"
    assert advisory.source_name == "India Meteorological Department (IMD)"
    assert advisory.payload["rain_prob"] == 70


def test_refresh_token_session_and_revocation(db_session):
    """
    Test RefreshToken model: active session tracking, family revocation, and expiration per §6.
    """
    user = User(
        full_name="Token User",
        phone_number="+919844444444",
        password_hash="hash",
    )
    db_session.add(user)
    db_session.commit()

    family_id = str(uuid.uuid4())
    token = RefreshToken(
        user_id=user.id,
        token_hash="hashed_refresh_token_sample_abc123",
        token_family=family_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        ip_address="192.168.1.100",
    )
    db_session.add(token)
    db_session.commit()

    assert token.id is not None
    assert token.is_valid is True
    assert token.is_revoked is False
    assert token.is_expired is False

    # Revoke token
    token.revoke()
    db_session.commit()

    assert token.is_revoked is True
    assert token.is_valid is False


def test_audit_log_with_mandatory_reason(db_session):
    """
    Test AuditLog model with mandatory reason field for sensitive document views per §4, §5 & §9.
    """
    super_admin = User(
        full_name="Audited SuperAdmin",
        phone_number="+919855555555",
        platform_role=User.PLATFORM_ROLE_SUPER_ADMIN,
        password_hash="hash",
    )
    db_session.add(super_admin)
    db_session.commit()

    target_verif_id = str(uuid.uuid4())
    log_entry = AuditLog(
        actor_user_id=super_admin.id,
        action="view_verification_document",
        resource_type="farmer_verification",
        resource_id=target_verif_id,
        reason="Dispute resolution for application verification ID 1042",
        metadata_redacted={"target_user_id": str(uuid.uuid4()), "document_type": "land_photo"},
    )
    db_session.add(log_entry)
    db_session.commit()

    assert log_entry.id is not None
    assert log_entry.actor_user_id == super_admin.id
    assert log_entry.action == "view_verification_document"
    assert log_entry.reason == "Dispute resolution for application verification ID 1042"
    assert log_entry.metadata_redacted["document_type"] == "land_photo"
    assert log_entry.actor.full_name == "Audited SuperAdmin"
