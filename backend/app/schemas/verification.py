"""
Bhoomi — Farmer Verification Validation Schemas
Validates upload requests, submissions, photo view requests, and admin reviews per §5.
"""
from __future__ import annotations

from marshmallow import Schema, fields, validate, validates_schema, ValidationError, EXCLUDE


class UploadUrlRequestSchema(Schema):
    """Validates payload for requesting a presigned upload URL."""
    class Meta:
        unknown = EXCLUDE

    photo_type = fields.Str(
        required=True,
        validate=validate.OneOf(["selfie", "land"], error="photo_type must be 'selfie' or 'land'."),
    )
    content_type = fields.Str(
        required=True,
        validate=validate.OneOf(
            ["image/jpeg", "image/jpg", "image/png", "image/webp"],
            error="content_type must be JPEG, PNG, or WebP.",
        ),
    )
    file_size_bytes = fields.Int(
        load_default=1024 * 1024,
        validate=validate.Range(
            min=1,
            max=10 * 1024 * 1024,
            error="file_size_bytes must be between 1 byte and 10MB.",
        ),
    )


class SubmitVerificationSchema(Schema):
    """Validates payload for submitting verification documents."""
    class Meta:
        unknown = EXCLUDE

    selfie_photo_key = fields.Str(
        required=True,
        validate=validate.Length(min=5, max=500),
    )
    land_photo_key = fields.Str(
        required=True,
        validate=validate.Length(min=5, max=500),
    )


class ViewPhotoRequestSchema(Schema):
    """
    Validates request to generate a presigned GET URL for a verification document.
    Requires a non-empty, meaningful reason per §5.
    """
    class Meta:
        unknown = EXCLUDE

    photo_type = fields.Str(
        required=True,
        validate=validate.OneOf(["selfie", "land"], error="photo_type must be 'selfie' or 'land'."),
    )
    reason = fields.Str(
        required=True,
        validate=validate.Length(
            min=5,
            max=500,
            error="reason must be at least 5 characters explaining why the document is being accessed.",
        ),
    )


class ReviewVerificationSchema(Schema):
    """
    Validates admin review decision (approve/reject).
    Rejection requires an explicit reason.
    """
    class Meta:
        unknown = EXCLUDE

    decision = fields.Str(
        required=True,
        validate=validate.OneOf(["verified", "rejected"], error="decision must be 'verified' or 'rejected'."),
    )
    reason = fields.Str(
        load_default=None,
        allow_none=True,
        validate=validate.Length(max=1000),
    )

    @validates_schema
    def validate_rejection_reason(self, data: dict, **kwargs) -> None:
        if data.get("decision") == "rejected":
            reason = data.get("reason")
            if not reason or len(reason.strip()) < 5:
                raise ValidationError(
                    {"reason": ["A reason of at least 5 characters is mandatory when rejecting verification."]}
                )
