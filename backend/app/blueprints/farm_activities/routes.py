"""
Bhoomi — Farm Activities Blueprint Routes
Implements CRUD and status completion for FarmActivity entities with ownership validation.
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any
from flask import jsonify, request
from flask_jwt_extended import jwt_required, current_user
from marshmallow import ValidationError

from app.extensions import db
from app.models.farm import Farm, Plot, CropCycle, CropCatalog, FarmActivity
from app.schemas.activity import CreateActivitySchema, UpdateActivitySchema, CompleteActivitySchema
from app.rbac import user_type_required

from . import farm_activities_bp

_create_activity_schema = CreateActivitySchema()
_update_activity_schema = UpdateActivitySchema()
_complete_activity_schema = CompleteActivitySchema()


def _verify_cycle_owner(cycle_id: uuid.UUID) -> tuple[CropCycle | None, tuple[Any, int] | None]:
    """Helper to verify current_user owns the farm/plot of this crop cycle."""
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
            "message": "You do not have permission to manage activities for this crop cycle.",
        }), 403)
    return cycle, None


def _verify_activity_owner(activity_id: uuid.UUID) -> tuple[FarmActivity | None, tuple[Any, int] | None]:
    """Helper to verify current_user owns the farm/plot/crop cycle of this activity."""
    activity = FarmActivity.query.get(activity_id)
    if not activity:
        return None, (jsonify({"error": "not_found", "message": "Farm activity not found."}), 404)
    cycle = CropCycle.query.get(activity.crop_cycle_id)
    if not cycle:
        return None, (jsonify({"error": "not_found", "message": "Parent crop cycle not found."}), 404)
    plot = Plot.query.get(cycle.plot_id)
    if not plot:
        return None, (jsonify({"error": "not_found", "message": "Parent plot not found."}), 404)
    farm = Farm.query.get(plot.farm_id)
    if not farm or farm.user_id != current_user.id:
        return None, (jsonify({
            "error": "forbidden",
            "message": "You do not have permission to access this activity.",
        }), 403)
    return activity, None


@farm_activities_bp.route("", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def list_my_activities():
    """
    GET /api/activities
    Lists all activities across all crop cycles and farms owned by current_user.
    Query params: is_completed (bool), activity_type, from_date, to_date.
    """
    is_completed = request.args.get("is_completed")
    activity_type = request.args.get("activity_type")
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")

    query = (
        FarmActivity.query
        .join(CropCycle, FarmActivity.crop_cycle_id == CropCycle.id)
        .join(Plot, CropCycle.plot_id == Plot.id)
        .join(Farm, Plot.farm_id == Farm.id)
        .filter(Farm.user_id == current_user.id)
    )

    if is_completed is not None:
        if is_completed.lower() in ("true", "1", "yes"):
            query = query.filter(FarmActivity.completed_date.isnot(None))
        else:
            query = query.filter(FarmActivity.completed_date.is_(None))

    if activity_type:
        query = query.filter(FarmActivity.activity_type == activity_type)

    if from_date:
        query = query.filter(FarmActivity.scheduled_date >= from_date)
    if to_date:
        query = query.filter(FarmActivity.scheduled_date <= to_date)

    activities = query.order_by(FarmActivity.scheduled_date.asc(), FarmActivity.created_at.desc()).all()

    results = []
    for a in activities:
        d = a.to_dict()
        cycle = a.crop_cycle
        plot = cycle.plot if cycle else None
        crop = cycle.crop_catalog if cycle else None
        d["crop_name"] = crop.crop_name if crop else "Unknown"
        d["plot_name"] = plot.plot_name if plot else "Unknown"
        results.append(d)

    return jsonify({"activities": results, "total": len(results)}), 200


@farm_activities_bp.route("/cycle/<uuid:cycle_id>", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def list_activities_for_cycle(cycle_id: uuid.UUID):
    """
    GET /api/activities/cycle/<cycle_id>
    Lists activities for a specific crop cycle.
    Owner-only verification.
    """
    cycle, err = _verify_cycle_owner(cycle_id)
    if err:
        return err

    activities = cycle.activities.order_by(FarmActivity.scheduled_date.asc()).all()
    return jsonify({
        "activities": [a.to_dict() for a in activities],
        "total": len(activities),
        "crop_cycle_id": str(cycle_id),
    }), 200


@farm_activities_bp.route("/cycle/<uuid:cycle_id>", methods=["POST"])
@jwt_required()
@user_type_required("farmer")
def create_activity(cycle_id: uuid.UUID):
    """
    POST /api/activities/cycle/<cycle_id>
    Logs or schedules an activity for a crop cycle.
    Owner-only verification.
    """
    cycle, err = _verify_cycle_owner(cycle_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _create_activity_schema.load(body)
    except ValidationError as err_val:
        return jsonify({"error": "validation_error", "messages": err_val.messages}), 422

    activity = FarmActivity(
        crop_cycle_id=cycle.id,
        activity_type=data["activity_type"],
        scheduled_date=data.get("scheduled_date"),
        completed_date=data.get("completed_date"),
        notes=data.get("notes"),
    )
    db.session.add(activity)
    db.session.commit()

    return jsonify({
        "message": "Activity logged successfully.",
        "activity": activity.to_dict(),
    }), 201


@farm_activities_bp.route("/<uuid:activity_id>", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def get_activity(activity_id: uuid.UUID):
    """
    GET /api/activities/<id>
    Returns single activity details.
    Owner-only verification.
    """
    activity, err = _verify_activity_owner(activity_id)
    if err:
        return err

    d = activity.to_dict()
    cycle = activity.crop_cycle
    plot = cycle.plot if cycle else None
    crop = cycle.crop_catalog if cycle else None
    d["crop_name"] = crop.crop_name if crop else "Unknown"
    d["plot_name"] = plot.plot_name if plot else "Unknown"

    return jsonify({"activity": d}), 200


@farm_activities_bp.route("/<uuid:activity_id>", methods=["PUT", "PATCH"])
@jwt_required()
@user_type_required("farmer")
def update_activity(activity_id: uuid.UUID):
    """
    PATCH /api/activities/<id>
    Updates activity details.
    Owner-only verification.
    """
    activity, err = _verify_activity_owner(activity_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _update_activity_schema.load(body)
    except ValidationError as err_val:
        return jsonify({"error": "validation_error", "messages": err_val.messages}), 422

    if "activity_type" in data:
        activity.activity_type = data["activity_type"]
    if "scheduled_date" in data:
        activity.scheduled_date = data["scheduled_date"]
    if "completed_date" in data:
        activity.completed_date = data["completed_date"]
    if "notes" in data:
        activity.notes = data["notes"]

    db.session.commit()

    return jsonify({
        "message": "Activity updated successfully.",
        "activity": activity.to_dict(),
    }), 200


@farm_activities_bp.route("/<uuid:activity_id>/complete", methods=["POST", "PATCH"])
@jwt_required()
@user_type_required("farmer")
def complete_activity(activity_id: uuid.UUID):
    """
    POST /api/activities/<id>/complete
    Quick action to mark an activity completed.
    Owner-only verification.
    """
    activity, err = _verify_activity_owner(activity_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _complete_activity_schema.load(body)
    except ValidationError as err_val:
        return jsonify({"error": "validation_error", "messages": err_val.messages}), 422

    activity.completed_date = data.get("completed_date") or date.today()
    if data.get("notes"):
        activity.notes = data["notes"]

    db.session.commit()

    return jsonify({
        "message": "Activity marked as completed.",
        "activity": activity.to_dict(),
    }), 200


@farm_activities_bp.route("/<uuid:activity_id>", methods=["DELETE"])
@jwt_required()
@user_type_required("farmer")
def delete_activity(activity_id: uuid.UUID):
    """
    DELETE /api/activities/<id>
    Deletes an activity.
    Owner-only verification.
    """
    activity, err = _verify_activity_owner(activity_id)
    if err:
        return err

    db.session.delete(activity)
    db.session.commit()

    return jsonify({"message": "Activity deleted successfully."}), 200
