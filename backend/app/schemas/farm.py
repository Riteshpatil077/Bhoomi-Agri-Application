"""
Bhoomi — Farm, Plot, CropCycle, CropCatalog Validation Schemas
Validates inputs for agricultural lifecycle entities per §4 & Prompt 6.
"""
from __future__ import annotations

from marshmallow import Schema, fields, validate, validates_schema, ValidationError, EXCLUDE


class CreateFarmSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(required=True, validate=validate.Length(min=2, max=255))
    latitude = fields.Float(load_default=None, allow_none=True, validate=validate.Range(min=-90.0, max=90.0))
    longitude = fields.Float(load_default=None, allow_none=True, validate=validate.Range(min=-180.0, max=180.0))
    soil_type = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=100))


class UpdateFarmSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=2, max=255))
    latitude = fields.Float(allow_none=True, validate=validate.Range(min=-90.0, max=90.0))
    longitude = fields.Float(allow_none=True, validate=validate.Range(min=-180.0, max=180.0))
    soil_type = fields.Str(allow_none=True, validate=validate.Length(max=100))


class CreatePlotSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    plot_name = fields.Str(required=True, validate=validate.Length(min=1, max=255))
    area_acres = fields.Float(required=True, validate=validate.Range(min=0.01, max=100000.0))


class UpdatePlotSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    plot_name = fields.Str(validate=validate.Length(min=1, max=255))
    area_acres = fields.Float(validate=validate.Range(min=0.01, max=100000.0))


class CreateCropCycleSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    crop_catalog_id = fields.UUID(required=True)
    sowing_date = fields.Date(required=True)
    expected_harvest_date = fields.Date(load_default=None, allow_none=True)
    status = fields.Str(
        load_default="active",
        validate=validate.OneOf(["active", "harvested", "failed"]),
    )

    @validates_schema
    def validate_dates(self, data: dict, **kwargs) -> None:
        sowing = data.get("sowing_date")
        expected = data.get("expected_harvest_date")
        if sowing and expected and expected < sowing:
            raise ValidationError(
                {"expected_harvest_date": ["Expected harvest date cannot be earlier than sowing date."]}
            )


class UpdateCropCycleSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    expected_harvest_date = fields.Date(allow_none=True)
    actual_harvest_date = fields.Date(allow_none=True)
    status = fields.Str(validate=validate.OneOf(["active", "harvested", "failed"]))

    @validates_schema
    def validate_harvest_dates(self, data: dict, **kwargs) -> None:
        status = data.get("status")
        actual = data.get("actual_harvest_date")
        if status == "harvested" and not actual:
            # Not an error if actual is not provided, but actual date must be valid if given
            pass
