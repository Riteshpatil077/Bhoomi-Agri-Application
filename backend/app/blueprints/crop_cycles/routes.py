"""
Bhoomi — Crop Cycles Blueprint Routes
Implements CRUD for CropCycle entities with plot/farm ownership verification per §4 & Prompt 6.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any
from flask import jsonify, request
from flask_jwt_extended import jwt_required, current_user
from marshmallow import ValidationError

from app.extensions import db
from app.models.farm import Farm, Plot, CropCatalog, CropCycle
from app.schemas.farm import CreateCropCycleSchema, UpdateCropCycleSchema
from app.rbac import user_type_required, verified_farmer_required

from . import crop_cycles_bp

_create_cycle_schema = CreateCropCycleSchema()
_update_cycle_schema = UpdateCropCycleSchema()


def _verify_plot_owner(plot_id: uuid.UUID) -> tuple[Plot | None, tuple[Any, int] | None]:
    """Helper to verify current_user owns the farm associated with the plot."""
    plot = Plot.query.get(plot_id)
    if not plot:
        return None, (jsonify({"error": "not_found", "message": "Plot not found."}), 404)
    farm = Farm.query.get(plot.farm_id)
    if not farm or farm.user_id != current_user.id:
        return None, (jsonify({
            "error": "forbidden",
            "message": "You do not have permission to manage crop cycles on this plot.",
        }), 403)
    return plot, None


def _verify_cycle_owner(cycle_id: uuid.UUID) -> tuple[CropCycle | None, tuple[Any, int] | None]:
    """Helper to verify current_user owns the plot and farm of this crop cycle."""
    cycle = CropCycle.query.get(cycle_id)
    if not cycle:
        return None, (jsonify({"error": "not_found", "message": "Crop cycle not found."}), 404)
    plot = Plot.query.get(cycle.plot_id)
    if not plot:
        return None, (jsonify({"error": "not_found", "message": "Parent plot not found."}), 404)
    farm = Farm.query.get(plot.farm_id)
    if not farm or farm.user_id != current_user.id:
        return None, (jsonify({
            "error": "forbidden",
            "message": "You do not have permission to access this crop cycle.",
        }), 403)
    return cycle, None


@crop_cycles_bp.route("", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def list_my_crop_cycles():
    """
    GET /api/crop-cycles
    Returns all crop cycles across all farms owned by the caller.
    Query params: status ('active' | 'harvested' | 'failed').
    """
    status_filter = request.args.get("status")

    # Join Farm -> Plot -> CropCycle
    query = (
        CropCycle.query
        .join(Plot, CropCycle.plot_id == Plot.id)
        .join(Farm, Plot.farm_id == Farm.id)
        .filter(Farm.user_id == current_user.id)
    )

    if status_filter:
        query = query.filter(CropCycle.status == status_filter)

    cycles = query.order_by(CropCycle.created_at.desc()).all()
    results = []
    for c in cycles:
        d = c.to_dict()
        crop_cat = CropCatalog.query.get(c.crop_catalog_id)
        plot = Plot.query.get(c.plot_id)
        d["crop_name"] = crop_cat.crop_name if crop_cat else "Unknown"
        d["category"] = crop_cat.category if crop_cat else "Unknown"
        d["plot_name"] = plot.plot_name if plot else "Unknown"
        results.append(d)

    return jsonify({"crop_cycles": results, "total": len(results)}), 200


@crop_cycles_bp.route("/plot/<uuid:plot_id>", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def list_crop_cycles_for_plot(plot_id: uuid.UUID):
    """
    GET /api/crop-cycles/plot/<plot_id>
    Lists all crop cycles for a specific plot.
    Owner-only verification.
    """
    plot, err = _verify_plot_owner(plot_id)
    if err:
        return err

    status_filter = request.args.get("status")
    query = plot.crop_cycles
    if status_filter:
        query = query.filter_by(status=status_filter)

    cycles = query.order_by(CropCycle.created_at.desc()).all()
    results = []
    for c in cycles:
        d = c.to_dict()
        crop_cat = CropCatalog.query.get(c.crop_catalog_id)
        d["crop_name"] = crop_cat.crop_name if crop_cat else "Unknown"
        d["category"] = crop_cat.category if crop_cat else "Unknown"
        results.append(d)

    return jsonify({"crop_cycles": results, "total": len(results), "plot_id": str(plot_id)}), 200


@crop_cycles_bp.route("/plot/<uuid:plot_id>", methods=["POST"])
@jwt_required()
@user_type_required("farmer")
@verified_farmer_required
def create_crop_cycle(plot_id: uuid.UUID):
    """
    POST /api/crop-cycles/plot/<plot_id>
    Creates a new crop cycle on a plot.
    Calculates expected_harvest_date from crop catalog duration if not provided.
    Owner-only verification.
    """
    plot, err = _verify_plot_owner(plot_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _create_cycle_schema.load(body)
    except ValidationError as err_val:
        return jsonify({"error": "validation_error", "messages": err_val.messages}), 422

    crop_catalog_id = data["crop_catalog_id"]
    crop = CropCatalog.query.get(crop_catalog_id)
    if not crop:
        return jsonify({"error": "not_found", "message": "Crop catalog entry not found."}), 404

    sowing_date = data["sowing_date"]
    expected_harvest = data.get("expected_harvest_date")

    # Automatically compute expected_harvest_date if not supplied (§4, §12.2)
    if not expected_harvest and crop.typical_duration_days:
        expected_harvest = sowing_date + timedelta(days=crop.typical_duration_days)

    cycle = CropCycle(
        plot_id=plot.id,
        crop_catalog_id=crop.id,
        sowing_date=sowing_date,
        expected_harvest_date=expected_harvest,
        status=data.get("status", "active"),
    )
    db.session.add(cycle)
    db.session.commit()

    d = cycle.to_dict()
    d["crop_name"] = crop.crop_name
    d["category"] = crop.category

    return jsonify({
        "message": "Crop cycle created successfully.",
        "crop_cycle": d,
    }), 201


@crop_cycles_bp.route("/<uuid:cycle_id>", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def get_crop_cycle(cycle_id: uuid.UUID):
    """
    GET /api/crop-cycles/<cycle_id>
    Returns crop cycle details with crop catalog info and activities.
    Owner-only verification.
    """
    cycle, err = _verify_cycle_owner(cycle_id)
    if err:
        return err

    d = cycle.to_dict()
    crop = CropCatalog.query.get(cycle.crop_catalog_id)
    plot = Plot.query.get(cycle.plot_id)
    d["crop"] = crop.to_dict() if crop else None
    d["plot_name"] = plot.plot_name if plot else None
    d["activities"] = [a.to_dict() for a in cycle.activities.all()]

    return jsonify({"crop_cycle": d}), 200


@crop_cycles_bp.route("/<uuid:cycle_id>", methods=["PUT", "PATCH"])
@jwt_required()
@user_type_required("farmer")
def update_crop_cycle(cycle_id: uuid.UUID):
    """
    PATCH/PUT /api/crop-cycles/<cycle_id>
    Updates crop cycle status or harvest dates.
    Owner-only verification.
    """
    cycle, err = _verify_cycle_owner(cycle_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _update_cycle_schema.load(body)
    except ValidationError as err_val:
        return jsonify({"error": "validation_error", "messages": err_val.messages}), 422

    date_errors = {}
    expected_harvest = data.get("expected_harvest_date")
    actual_harvest = data.get("actual_harvest_date")
    if expected_harvest and cycle.sowing_date and expected_harvest <= cycle.sowing_date:
        date_errors["expected_harvest_date"] = [
            "Expected harvest date must be after sowing date."
        ]
    if actual_harvest and cycle.sowing_date and actual_harvest < cycle.sowing_date:
        date_errors["actual_harvest_date"] = [
            "Actual harvest date cannot be earlier than sowing date."
        ]
    if (
        data.get("status") == "harvested"
        and not cycle.actual_harvest_date
        and not actual_harvest
        and cycle.sowing_date
        and date.today() < cycle.sowing_date
    ):
        date_errors["status"] = [
            "A cycle cannot be harvested before its sowing date."
        ]
    if date_errors:
        return jsonify({"error": "validation_error", "messages": date_errors}), 422

    if "status" in data:
        new_status = data["status"]
        cycle.status = new_status
        if new_status == "harvested" and not cycle.actual_harvest_date and not data.get("actual_harvest_date"):
            cycle.actual_harvest_date = date.today()

    if "expected_harvest_date" in data:
        cycle.expected_harvest_date = data["expected_harvest_date"]
    if "actual_harvest_date" in data:
        cycle.actual_harvest_date = data["actual_harvest_date"]

    db.session.commit()

    return jsonify({
        "message": "Crop cycle updated successfully.",
        "crop_cycle": cycle.to_dict(),
    }), 200


@crop_cycles_bp.route("/<uuid:cycle_id>", methods=["DELETE"])
@jwt_required()
@user_type_required("farmer")
def delete_crop_cycle(cycle_id: uuid.UUID):
    """
    DELETE /api/crop-cycles/<cycle_id>
    Deletes crop cycle and cascades to activities.
    Owner-only verification.
    """
    cycle, err = _verify_cycle_owner(cycle_id)
    if err:
        return err

    db.session.delete(cycle)
    db.session.commit()

    return jsonify({"message": "Crop cycle deleted successfully."}), 200
