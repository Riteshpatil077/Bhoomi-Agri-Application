"""
Bhoomi — Farm Activity Validation Schemas
Validates farm activity logging and completion per §4 & Prompt 7.
"""
from __future__ import annotations

from datetime import date
from marshmallow import Schema, fields, validate, EXCLUDE
from app.models.farm import FarmActivity


class CreateActivitySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    activity_type = fields.Str(
        required=True,
        validate=validate.OneOf(
            list(FarmActivity.ACTIVITY_TYPES),
            error=f"activity_type must be one of: {list(FarmActivity.ACTIVITY_TYPES)}",
        ),
    )
    scheduled_date = fields.Date(load_default=date.today)
    completed_date = fields.Date(load_default=None, allow_none=True)
    notes = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=2000))


class UpdateActivitySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    activity_type = fields.Str(
        validate=validate.OneOf(list(FarmActivity.ACTIVITY_TYPES))
    )
    scheduled_date = fields.Date(allow_none=True)
    completed_date = fields.Date(allow_none=True)
    notes = fields.Str(allow_none=True, validate=validate.Length(max=2000))


class CompleteActivitySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    completed_date = fields.Date(load_default=date.today)
    notes = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=2000))
