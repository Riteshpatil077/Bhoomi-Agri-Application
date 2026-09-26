"""
Bhoomi — Auth Validation Schemas
Marshmallow schemas for registration, login, and step-up authentication.
"""
from __future__ import annotations

import re
from marshmallow import Schema, fields, validate, validates, ValidationError, EXCLUDE

from app.models.user import User


class RegisterSchema(Schema):
    """
    Schema for user registration.
    NOTE per §7.6: platform_role is NEVER accepted from the client;
    it is strictly ignored and always defaults to 'user' in the business logic.
    """
    class Meta:
        unknown = EXCLUDE
    full_name = fields.String(
        required=True,
        validate=validate.Length(min=2, max=255, error="Full name must be between 2 and 255 characters."),
    )
    phone_number = fields.String(
        required=True,
        validate=validate.Length(min=8, max=20, error="Phone number must be between 8 and 20 characters."),
    )
    email = fields.Email(
        required=False,
        allow_none=True,
        validate=validate.Length(max=255),
    )
    password = fields.String(
        required=True,
        load_only=True,
        validate=validate.Length(min=8, max=128, error="Password must be at least 8 characters long."),
    )
    user_type = fields.String(
        required=False,
        validate=validate.OneOf(
            User.USER_TYPES,
            error=f"user_type must be one of: {', '.join(User.USER_TYPES)}",
        ),
        load_default=User.USER_TYPE_FARMER,
    )
    preferred_language = fields.String(
        required=False,
        validate=validate.Length(min=2, max=10),
        load_default="en",
    )

    @validates("phone_number")
    def validate_phone(self, value: str) -> None:
        # Standard international or local format: digits, optional leading +
        cleaned = value.strip().replace(" ", "").replace("-", "")
        if not re.match(r"^\+?[0-9]{8,15}$", cleaned):
            raise ValidationError("Invalid phone number format.")


class LoginSchema(Schema):
    """Schema for user login with either phone number or email."""
    class Meta:
        unknown = EXCLUDE
    identifier = fields.String(
        required=True,
        error_messages={"required": "Phone number or email is required."},
    )
    password = fields.String(
        required=True,
        load_only=True,
        error_messages={"required": "Password is required."},
    )


class StepUpSchema(Schema):
    """Schema for step-up password confirmation."""
    class Meta:
        unknown = EXCLUDE
    password = fields.String(
        required=True,
        load_only=True,
        error_messages={"required": "Password confirmation is required."},
    )
