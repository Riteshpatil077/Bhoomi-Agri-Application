"""
Bhoomi — Farm, Plot, CropCatalog, CropCycle, FarmActivity Models
Implements the core farming lifecycle data hierarchy per §4.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, Index, UniqueConstraint
from app.extensions import db
from .base import UUIDPrimaryKeyMixin, TimestampMixin, utc_now


class Farm(db.Model, UUIDPrimaryKeyMixin, TimestampMixin):
    """Farm owned by a User (farmer)."""
    __tablename__ = "farms"
    __table_args__ = (UniqueConstraint("user_id", "client_request_id", name="uq_farms_user_client_request"),)

    user_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(255), nullable=False)
    client_request_id = db.Column(db.String(36), nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    location_name = db.Column(db.String(255), nullable=True)
    soil_type = db.Column(db.String(100), nullable=True)
    soil_type_source = db.Column(
        db.String(30), nullable=False, default="farmer_provided", server_default="farmer_provided"
    )
    soil_region = db.Column(db.String(120), nullable=True)

    # Relationships
    user = db.relationship("User", back_populates="farms")
    plots = db.relationship(
        "Plot",
        back_populates="farm",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "name": self.name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "location_name": self.location_name,
            "soil_type": self.soil_type,
            "soil_type_source": self.soil_type_source,
            "soil_region": self.soil_region,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<Farm {self.id} '{self.name}' user={self.user_id}>"


class Plot(db.Model, UUIDPrimaryKeyMixin, TimestampMixin):
    """Plot of land within a Farm."""
    __tablename__ = "plots"
    __table_args__ = (UniqueConstraint("farm_id", "client_request_id", name="uq_plots_farm_client_request"),)

    farm_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("farms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_request_id = db.Column(db.String(36), nullable=True)
    plot_name = db.Column(db.String(255), nullable=False)
    area_acres = db.Column(db.Float, nullable=False)
    area_is_estimated = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())

    # Relationships
    farm = db.relationship("Farm", back_populates="plots")
    crop_cycles = db.relationship(
        "CropCycle",
        back_populates="plot",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "farm_id": str(self.farm_id),
            "plot_name": self.plot_name,
            "area_acres": self.area_acres,
            "area_is_estimated": self.area_is_estimated,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<Plot {self.id} '{self.plot_name}' ({self.area_acres} acres) farm={self.farm_id}>"


class CropCatalog(db.Model, UUIDPrimaryKeyMixin):
    """Reusable reference catalog of crops."""
    __tablename__ = "crop_catalog"

    crop_name = db.Column(db.String(150), unique=True, nullable=False, index=True)
    category = db.Column(db.String(100), nullable=True)
    typical_duration_days = db.Column(db.Integer, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    crop_cycles = db.relationship("CropCycle", back_populates="crop_catalog", lazy="dynamic")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "crop_name": self.crop_name,
            "category": self.category,
            "typical_duration_days": self.typical_duration_days,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<CropCatalog {self.id} '{self.crop_name}'>"


class CropCycle(db.Model, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    An instance of growing a specific crop on a specific plot.
    Status transitions: active -> harvested | failed
    """
    __tablename__ = "crop_cycles"

    STATUS_ACTIVE = "active"
    STATUS_HARVESTED = "harvested"
    STATUS_FAILED = "failed"
    STATUSES = (STATUS_ACTIVE, STATUS_HARVESTED, STATUS_FAILED)

    plot_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("plots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    crop_catalog_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("crop_catalog.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sowing_date = db.Column(db.Date, nullable=True)
    expected_harvest_date = db.Column(db.Date, nullable=True)
    actual_harvest_date = db.Column(db.Date, nullable=True)
    status = db.Column(
        db.String(50),
        nullable=False,
        default=STATUS_ACTIVE,
        index=True,
    )

    # Relationships
    plot = db.relationship("Plot", back_populates="crop_cycles")
    crop_catalog = db.relationship("CropCatalog", back_populates="crop_cycles")
    activities = db.relationship(
        "FarmActivity",
        back_populates="crop_cycle",
        cascade="all, delete-orphan",
        lazy="dynamic",
    )

    # Composite index per §4: composite (plot_id, status) on crop_cycles
    __table_args__ = (
        Index("ix_crop_cycles_plot_id_status", "plot_id", "status"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "plot_id": str(self.plot_id),
            "crop_catalog_id": str(self.crop_catalog_id),
            "crop_name": self.crop_catalog.crop_name if self.crop_catalog else None,
            "sowing_date": self.sowing_date.isoformat() if self.sowing_date else None,
            "expected_harvest_date": self.expected_harvest_date.isoformat() if self.expected_harvest_date else None,
            "actual_harvest_date": self.actual_harvest_date.isoformat() if self.actual_harvest_date else None,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<CropCycle {self.id} plot={self.plot_id} crop={self.crop_catalog_id} status={self.status}>"


class FarmActivity(db.Model, UUIDPrimaryKeyMixin):
    """
    Activity logged or scheduled against a crop cycle (irrigation, fertilizer, etc.).
    """
    __tablename__ = "farm_activities"

    ACTIVITY_IRRIGATION = "irrigation"
    ACTIVITY_FERTILIZER = "fertilizer"
    ACTIVITY_PESTICIDE = "pesticide"
    ACTIVITY_OTHER = "other"
    ACTIVITY_TYPES = (
        ACTIVITY_IRRIGATION,
        ACTIVITY_FERTILIZER,
        ACTIVITY_PESTICIDE,
        ACTIVITY_OTHER,
    )

    crop_cycle_id = db.Column(
        db.Uuid(as_uuid=True),
        db.ForeignKey("crop_cycles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_type = db.Column(db.String(50), nullable=False, index=True)
    scheduled_date = db.Column(db.Date, nullable=True, index=True)
    completed_date = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    crop_cycle = db.relationship("CropCycle", back_populates="activities")

    @property
    def is_completed(self) -> bool:
        return self.completed_date is not None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "crop_cycle_id": str(self.crop_cycle_id),
            "activity_type": self.activity_type,
            "scheduled_date": self.scheduled_date.isoformat() if self.scheduled_date else None,
            "completed_date": self.completed_date.isoformat() if self.completed_date else None,
            "is_completed": self.is_completed,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        status = f"done@{self.completed_date}" if self.is_completed else f"due@{self.scheduled_date}"
        return f"<FarmActivity {self.id} cycle={self.crop_cycle_id} type={self.activity_type} ({status})>"
