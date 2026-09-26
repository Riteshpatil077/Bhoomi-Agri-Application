"""
Bhoomi — Weather Advisory Model
Stores weather forecasts and agronomic advisories with external data provenance per §4 & §8.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, utc_now


class WeatherAdvisory(db.Model, UUIDPrimaryKeyMixin):
    """
    Hyperlocal weather forecast or agronomic advisory.
    Tracks provenance (source_name, source_updated_at, valid_until) per §8.
    """
    __tablename__ = "weather_advisories"

    DATA_TYPE_FORECAST = "forecast"
    DATA_TYPE_ADVISORY = "advisory"
    DATA_TYPES = (DATA_TYPE_FORECAST, DATA_TYPE_ADVISORY)

    region_code = db.Column(db.String(100), nullable=False, index=True)
    source_name = db.Column(db.String(255), nullable=False)
    data_type = db.Column(db.String(50), nullable=False, index=True)
    payload = db.Column(db.JSON, nullable=False)
    source_updated_at = db.Column(db.DateTime(timezone=True), nullable=False)
    valid_until = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "region_code": self.region_code,
            "source_name": self.source_name,
            "data_type": self.data_type,
            "payload": self.payload,
            "source_updated_at": self.source_updated_at.isoformat() if self.source_updated_at else None,
            "valid_until": self.valid_until.isoformat() if self.valid_until else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<WeatherAdvisory {self.id} region={self.region_code} type={self.data_type} source={self.source_name}>"
