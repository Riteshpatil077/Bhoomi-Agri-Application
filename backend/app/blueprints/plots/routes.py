"""
Bhoomi — Plots Blueprint Routes
Implements CRUD for Plot entities with parent-farm ownership verification per §4 & Prompt 6.
"""
from __future__ import annotations

import uuid
from typing import Any
from flask import jsonify, request
from flask_jwt_extended import jwt_required, current_user
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.farm import Farm, Plot
from app.schemas.farm import CreatePlotSchema, UpdatePlotSchema
from app.rbac import user_type_required

from . import plots_bp

_create_plot_schema = CreatePlotSchema()
_update_plot_schema = UpdatePlotSchema()


def _verify_farm_owner(farm_id: uuid.UUID) -> tuple[Farm | None, tuple[Any, int] | None]:
    """Helper to load a farm and assert current_user ownership."""
    farm = Farm.query.get(farm_id)
    if not farm:
        return None, (jsonify({"error": "not_found", "message": "Parent farm not found."}), 404)
    if farm.user_id != current_user.id:
        return None, (jsonify({
            "error": "forbidden",
            "message": "You do not have permission to access plots on this farm.",
        }), 403)
    return farm, None


def _verify_plot_owner(plot_id: uuid.UUID) -> tuple[Plot | None, tuple[Any, int] | None]:
    """Helper to load a plot and assert current_user ownership of parent farm."""
    plot = Plot.query.get(plot_id)
    if not plot:
        return None, (jsonify({"error": "not_found", "message": "Plot not found."}), 404)
    farm = Farm.query.get(plot.farm_id)
    if not farm or farm.user_id != current_user.id:
        return None, (jsonify({
            "error": "forbidden",
            "message": "You do not have permission to access this plot.",
        }), 403)
    return plot, None


@plots_bp.route("/farm/<uuid:farm_id>", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def list_plots_for_farm(farm_id: uuid.UUID):
    """
    GET /api/plots/farm/<farm_id>
    Lists all plots belonging to a specific farm.
    Owner-only verification.
    """
    farm, err = _verify_farm_owner(farm_id)
    if err:
        return err

    plots = farm.plots.order_by(Plot.created_at.asc()).all()
    result = []
    for p in plots:
        d = p.to_dict()
        d["active_cycles_count"] = p.crop_cycles.filter_by(status="active").count()
        result.append(d)

    return jsonify({"plots": result, "total": len(result), "farm_id": str(farm_id)}), 200


@plots_bp.route("/farm/<uuid:farm_id>", methods=["POST"])
@jwt_required()
@user_type_required("farmer")
def create_plot(farm_id: uuid.UUID):
    """
    POST /api/plots/farm/<farm_id>
    Creates a new plot in the specified farm.
    Owner-only verification.
    """
    farm, err = _verify_farm_owner(farm_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _create_plot_schema.load(body)
    except ValidationError as err_val:
        return jsonify({"error": "validation_error", "messages": err_val.messages}), 422

    request_id = data.get("client_request_id")
    if request_id:
        existing = Plot.query.filter_by(
            farm_id=farm.id, client_request_id=str(request_id)
        ).first()
        if existing:
            return jsonify({"message": "Plot was already created.", "plot": existing.to_dict()}), 200

    plot = Plot(
        farm_id=farm.id,
        client_request_id=str(request_id) if request_id else None,
        plot_name=data["plot_name"],
        area_acres=data["area_acres"],
        area_is_estimated=data.get("area_is_estimated", False),
    )
    db.session.add(plot)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        if request_id:
            existing = Plot.query.filter_by(
                farm_id=farm.id, client_request_id=str(request_id)
            ).first()
            if existing:
                return jsonify({"message": "Plot was already created.", "plot": existing.to_dict()}), 200
        raise

    return jsonify({
        "message": "Plot created successfully.",
        "plot": plot.to_dict(),
    }), 201


@plots_bp.route("/<uuid:plot_id>", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def get_plot(plot_id: uuid.UUID):
    """
    GET /api/plots/<plot_id>
    Returns single plot details and its crop cycles.
    Owner-only verification.
    """
    plot, err = _verify_plot_owner(plot_id)
    if err:
        return err

    d = plot.to_dict()
    d["crop_cycles"] = [c.to_dict() for c in plot.crop_cycles.all()]
    return jsonify({"plot": d}), 200


@plots_bp.route("/<uuid:plot_id>", methods=["PUT", "PATCH"])
@jwt_required()
@user_type_required("farmer")
def update_plot(plot_id: uuid.UUID):
    """
    PATCH/PUT /api/plots/<plot_id>
    Updates plot details.
    Owner-only verification.
    """
    plot, err = _verify_plot_owner(plot_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    try:
        data = _update_plot_schema.load(body)
    except ValidationError as err_val:
        return jsonify({"error": "validation_error", "messages": err_val.messages}), 422

    if "plot_name" in data:
        plot.plot_name = data["plot_name"]
    if "area_acres" in data:
        plot.area_acres = data["area_acres"]
    if "area_is_estimated" in data:
        plot.area_is_estimated = data["area_is_estimated"]

    db.session.commit()

    return jsonify({
        "message": "Plot updated successfully.",
        "plot": plot.to_dict(),
    }), 200


@plots_bp.route("/<uuid:plot_id>", methods=["DELETE"])
@jwt_required()
@user_type_required("farmer")
def delete_plot(plot_id: uuid.UUID):
    """
    DELETE /api/plots/<plot_id>
    Deletes plot and cascades to its crop cycles.
    Owner-only verification.
    """
    plot, err = _verify_plot_owner(plot_id)
    if err:
        return err

    db.session.delete(plot)
    db.session.commit()

    return jsonify({"message": "Plot and associated crop cycles deleted successfully."}), 200
