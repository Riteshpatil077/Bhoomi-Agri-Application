"""
Bhoomi — Farmer Verification Routes
Implements endpoints per §5:
  1. POST /api/verification/upload-url         — presigned upload URL (constrained Content-Type/size)
  2. POST /api/verification/submit             — submit selfie + land photo keys
  3. GET  /api/verification/status             — caller's verification status
  4. GET  /api/verification/applications       — list applications (permission_required('verification_review'))
  5. POST /api/verification/applications/<id>/photos/url — short-lived presigned GET URL with mandatory reason logged to audit_logs
  6. POST /api/verification/applications/<id>/review    — approve/reject with reason and retention schedule
  7. GET  /api/verification/farmer-only-test   — verification-gated endpoint testing
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, current_user
from marshmallow import ValidationError

from app.extensions import db, limiter
from app.models.base import utc_now
from app.models.user import User
from app.models.verification import FarmerVerification
from app.models.audit import AuditLog
from app.rbac import platform_role_required, permission_required, user_type_required, verified_farmer_required
from app.utils.storage import PrivateVerificationStorage, StorageException
from app.schemas.verification import (
    UploadUrlRequestSchema,
    SubmitVerificationSchema,
    ViewPhotoRequestSchema,
    ReviewVerificationSchema,
)

from . import verification_bp

_upload_url_schema = UploadUrlRequestSchema()
_submit_schema = SubmitVerificationSchema()
_view_photo_schema = ViewPhotoRequestSchema()
_review_schema = ReviewVerificationSchema()


# --------------------------------------------------------------------------- #
# Farmer self-service endpoints                                                #
# --------------------------------------------------------------------------- #

@verification_bp.route("/upload-url", methods=["POST"])
@jwt_required()
@user_type_required("farmer")
@limiter.limit("20 per minute")
def request_upload_url():
    """
    POST /api/verification/upload-url
    Requests a presigned upload URL for direct upload to the private verification bucket.
    Backend never proxies the raw image per §5.
    """
    body = request.get_json(silent=True) or {}
    try:
        data = _upload_url_schema.load(body)
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    photo_type = data["photo_type"]
    content_type = data["content_type"]
    file_size_bytes = data["file_size_bytes"]

    # Derive extension from content_type
    ext_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    ext = ext_map.get(content_type, "jpg")

    object_key = PrivateVerificationStorage.generate_object_key(
        user_id=current_user.id,
        photo_type=photo_type,
        extension=ext,
    )

    try:
        presigned = PrivateVerificationStorage.generate_presigned_upload_url(
            object_key=object_key,
            content_type=content_type,
            max_size_bytes=file_size_bytes,
        )
    except StorageException as exc:
        return jsonify({"error": "storage_error", "message": str(exc)}), 500

    return jsonify({
        "upload_url": presigned["upload_url"],
        "object_key": presigned["object_key"],
        "fields": presigned.get("fields", {}),
        "expires_in": presigned.get("expires_in", 300),
    }), 200


@verification_bp.route("/submit", methods=["POST"])
@jwt_required()
@user_type_required("farmer")
def submit_verification():
    """
    POST /api/verification/submit
    Submits selfie + land photo keys once client finishes uploading to S3.
    Updates applicant status to 'pending'.
    """
    body = request.get_json(silent=True) or {}
    try:
        data = _submit_schema.load(body)
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    selfie_key = data["selfie_photo_key"]
    land_key = data["land_photo_key"]

    # Ownership check: keys must belong to this user's scoped folder (§5, §9)
    expected_prefix = f"verifications/{current_user.id}/"
    if not selfie_key.startswith(expected_prefix) or not land_key.startswith(expected_prefix):
        return jsonify({
            "error": "invalid_object_key",
            "message": "Verification photos must belong to the authenticated user.",
        }), 403

    try:
        PrivateVerificationStorage.verify_uploaded_object(selfie_key)
        PrivateVerificationStorage.verify_uploaded_object(land_key)
    except StorageException as exc:
        return jsonify({"error": "invalid_upload", "message": str(exc)}), 422

    # Check for existing pending verification
    existing = FarmerVerification.query.filter_by(
        user_id=current_user.id,
        status=FarmerVerification.STATUS_PENDING,
    ).first()

    if existing:
        # Update existing pending application
        existing.selfie_photo_key = selfie_key
        existing.land_photo_key = land_key
        existing.submitted_at = utc_now()
        verification = existing
    else:
        verification = FarmerVerification(
            user_id=current_user.id,
            selfie_photo_key=selfie_key,
            land_photo_key=land_key,
            status=FarmerVerification.STATUS_PENDING,
        )
        db.session.add(verification)

    # Update user verification_status to pending
    user = User.query.get(current_user.id)
    if user:
        user.verification_status = User.VERIFICATION_STATUS_PENDING

    # Immutable audit trail
    audit_entry = AuditLog(
        actor_user_id=current_user.id,
        action="submit_farmer_verification",
        resource_type="farmer_verification",
        resource_id=str(verification.id),
        metadata_redacted={"user_id": str(current_user.id)},
    )
    db.session.add(audit_entry)
    db.session.commit()

    return jsonify({
        "message": "Verification application submitted successfully.",
        "verification": verification.to_dict(),
    }), 201


@verification_bp.route("/status", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def get_verification_status():
    """
    GET /api/verification/status
    Returns caller's verification status and latest application record.
    """
    latest = (
        FarmerVerification.query
        .filter_by(user_id=current_user.id)
        .order_by(FarmerVerification.submitted_at.desc())
        .first()
    )
    return jsonify({
        "user_id": str(current_user.id),
        "verification_status": current_user.verification_status,
        "application": latest.to_dict() if latest else None,
    }), 200


# --------------------------------------------------------------------------- #
# Verified farmer-only test endpoint (§7, Prompt 5 criteria)                   #
# --------------------------------------------------------------------------- #

@verification_bp.route("/farmer-only-test", methods=["GET"])
@jwt_required()
@verified_farmer_required
def farmer_only_resource():
    """
    GET /api/verification/farmer-only-test
    Demonstrates protection of farmer-only endpoints. Unverified users receive 403.
    """
    return jsonify({
        "message": "Welcome to the farmer-only resource.",
        "user_id": str(current_user.id),
        "status": current_user.verification_status,
    }), 200


# --------------------------------------------------------------------------- #
# Admin Review endpoints (§5, §7)                                             #
# Gated by permission_required('verification_review', allow_super_admin_bypass=False)
# --------------------------------------------------------------------------- #

@verification_bp.route("/applications", methods=["GET"])
@jwt_required()
@platform_role_required("admin", "super_admin")
@permission_required("verification_review", allow_super_admin_bypass=False)
def list_verification_applications():
    """
    GET /api/verification/applications
    Paginated list of verification applications.
    Does NOT return presigned photo URLs per §5.
    """
    status_filter = request.args.get("status", FarmerVerification.STATUS_PENDING)
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)

    query = FarmerVerification.query
    if status_filter:
        query = query.filter_by(status=status_filter)

    query = query.order_by(FarmerVerification.submitted_at.asc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    results = []
    for item in items:
        user = User.query.get(item.user_id)
        d = item.to_dict()
        d["applicant_name"] = user.full_name if user else "Unknown"
        d["applicant_phone"] = user.phone_number if user else "Unknown"
        results.append(d)

    return jsonify({
        "applications": results,
        "total": total,
        "page": page,
        "per_page": per_page,
    }), 200


@verification_bp.route("/applications/<uuid:application_id>/photos/url", methods=["POST"])
@jwt_required()
@platform_role_required("admin", "super_admin")
@permission_required("verification_review", allow_super_admin_bypass=False)
def get_photo_presigned_url(application_id: uuid.UUID):
    """
    POST /api/verification/applications/<id>/photos/url
    Issues short-lived (5 min) presigned GET URL for reviewing a verification photo.
    MANDATORY AUDIT LOG WITH REASON per §5:
    Every request MUST include a reason string, logged to audit_logs for both
    Admins and Super Admins.
    """
    body = request.get_json(silent=True) or {}
    try:
        data = _view_photo_schema.load(body)
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    photo_type = data["photo_type"]
    reason = data["reason"].strip()

    verification = FarmerVerification.query.get(application_id)
    if not verification:
        return jsonify({"error": "not_found", "message": "Verification application not found."}), 404

    photo_key = (
        verification.selfie_photo_key if photo_type == "selfie" else verification.land_photo_key
    )

    if not photo_key or photo_key == "[PURGED]":
        return jsonify({
            "error": "photo_purged",
            "message": "The requested document has passed retention and was purged.",
        }), 410

    # Generate 5-minute presigned GET URL
    expiry_seconds = current_app.config.get("PRESIGNED_URL_EXPIRY_DOWNLOAD", 300)
    try:
        download_url = PrivateVerificationStorage.generate_presigned_get_url(
            object_key=photo_key,
            expires_in=expiry_seconds,
        )
    except StorageException as exc:
        return jsonify({"error": "storage_error", "message": str(exc)}), 500

    # Write mandatory audit log entry with reason (§5, §9)
    audit_entry = AuditLog(
        actor_user_id=current_user.id,
        action="view_verification_document",
        resource_type="farmer_verification",
        resource_id=str(verification.id),
        reason=reason,
        metadata_redacted={
            "photo_type": photo_type,
            "target_user_id": str(verification.user_id),
            "object_key": photo_key,
        },
    )
    db.session.add(audit_entry)
    db.session.commit()

    return jsonify({
        "download_url": download_url,
        "expires_in": expiry_seconds,
        "photo_type": photo_type,
    }), 200


@verification_bp.route("/applications/<uuid:application_id>/review", methods=["POST"])
@jwt_required()
@platform_role_required("admin", "super_admin")
@permission_required("verification_review", allow_super_admin_bypass=False)
def review_verification(application_id: uuid.UUID):
    """
    POST /api/verification/applications/<id>/review
    Approves or rejects a verification application.
    Updates applicant's verification_status.
    Schedules docs_purge_at per §5 retention rules.
    """
    body = request.get_json(silent=True) or {}
    try:
        data = _review_schema.load(body)
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    decision = data["decision"]
    reason = data.get("reason")

    verification = FarmerVerification.query.get(application_id)
    if not verification:
        return jsonify({"error": "not_found", "message": "Verification application not found."}), 404

    # Calculate docs_purge_at based on retention config (§5)
    retention_days = current_app.config.get("VERIFICATION_DOC_RETENTION_DAYS", 30)
    purge_at = utc_now() + timedelta(days=retention_days)

    verification.status = decision
    verification.reviewed_by = current_user.id
    verification.reviewed_at = utc_now()
    verification.rejection_reason = reason if decision == FarmerVerification.STATUS_REJECTED else None
    verification.docs_purge_at = purge_at

    # Update user's verification_status
    applicant = User.query.get(verification.user_id)
    if applicant:
        applicant.verification_status = decision

    # Audit log
    audit_entry = AuditLog(
        actor_user_id=current_user.id,
        action=f"review_farmer_verification_{decision}",
        resource_type="farmer_verification",
        resource_id=str(verification.id),
        reason=reason,
        metadata_redacted={
            "decision": decision,
            "target_user_id": str(verification.user_id),
            "docs_purge_at": purge_at.isoformat(),
        },
    )
    db.session.add(audit_entry)
    db.session.commit()

    return jsonify({
        "message": f"Verification application marked as {decision}.",
        "verification": verification.to_dict(),
    }), 200
