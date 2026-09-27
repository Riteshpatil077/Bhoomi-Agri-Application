"""
Bhoomi — Farms Blueprint Routes
Implements full CRUD for Farm entity with strict owner-only access controls per §4 & Prompt 6.
"""
from __future__ import annotations

import uuid
from flask import jsonify, request
from flask_jwt_extended import jwt_required, current_user
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.farm import Farm
from app.schemas.farm import CreateFarmSchema, UpdateFarmSchema
from app.rbac import user_type_required

from . import farms_bp

_create_farm_schema = CreateFarmSchema()
_update_farm_schema = UpdateFarmSchema()


@farms_bp.route("", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def list_farms():
    """
    GET /api/farms
    Returns all farms owned by the authenticated user.
    """
    farms = (
        Farm.query
        .filter_by(user_id=current_user.id)
        .order_by(Farm.created_at.desc())
        .all()
    )
    result = []
    for f in farms:
        d = f.to_dict()
        d["plots_count"] = f.plots.count()
        result.append(d)

    return jsonify({"farms": result, "total": len(result)}), 200


@farms_bp.route("", methods=["POST"])
@jwt_required()
@user_type_required("farmer")
def create_farm():
    """
    POST /api/farms
    Creates a new farm record belonging exclusively to current_user.
    """
    body = request.get_json(silent=True) or {}
    try:
        data = _create_farm_schema.load(body)
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    request_id = data.get("client_request_id")
    if request_id:
        existing = Farm.query.filter_by(
            user_id=current_user.id, client_request_id=str(request_id)
        ).first()
        if existing:
            return jsonify({"message": "Farm was already created.", "farm": existing.to_dict()}), 200

    farm = Farm(
        user_id=current_user.id,
        name=data["name"],
        client_request_id=str(request_id) if request_id else None,
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        location_name=data.get("location_name"),
        soil_type=data.get("soil_type"),
        soil_type_source=data.get("soil_type_source", "farmer_provided"),
        soil_region=data.get("soil_region"),
    )
    db.session.add(farm)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        if request_id:
            existing = Farm.query.filter_by(
                user_id=current_user.id, client_request_id=str(request_id)
            ).first()
            if existing:
                return jsonify({"message": "Farm was already created.", "farm": existing.to_dict()}), 200
        raise

    return jsonify({
        "message": "Farm created successfully.",
        "farm": farm.to_dict(),
    }), 201


@farms_bp.route("/<uuid:farm_id>", methods=["GET"])
@jwt_required()
@user_type_required("farmer")
def get_farm(farm_id: uuid.UUID):
    """
    GET /api/farms/<farm_id>
    Returns farm details and its plots.
    Strict owner-only check: cross-user access returns 403 Forbidden.
    """
    farm = Farm.query.get(farm_id)
    if not farm:
        return jsonify({"error": "not_found", "message": "Farm not found."}), 404

    # Strict ownership check (§4, §7.2, Prompt 6)
    if farm.user_id != current_user.id:
        return jsonify({
            "error": "forbidden",
            "message": "You do not have permission to access this farm.",
        }), 403

    d = farm.to_dict()
    d["plots"] = [p.to_dict() for p in farm.plots.all()]
    return jsonify({"farm": d}), 200


@farms_bp.route("/<uuid:farm_id>", methods=["PUT", "PATCH"])
@jwt_required()
@user_type_required("farmer")
def update_farm(farm_id: uuid.UUID):
    """
    PATCH/PUT /api/farms/<farm_id>
    Updates farm details.
    Strict owner-only check: cross-user access returns 403 Forbidden.
    """
    farm = Farm.query.get(farm_id)
    if not farm:
        return jsonify({"error": "not_found", "message": "Farm not found."}), 404

    # Strict ownership check
    if farm.user_id != current_user.id:
        return jsonify({
            "error": "forbidden",
            "message": "You do not have permission to modify this farm.",
        }), 403

    body = request.get_json(silent=True) or {}
    try:
        data = _update_farm_schema.load(body)
    except ValidationError as err:
        return jsonify({"error": "validation_error", "messages": err.messages}), 422

    if "name" in data:
        farm.name = data["name"]
    if "latitude" in data:
        farm.latitude = data["latitude"]
    if "longitude" in data:
        farm.longitude = data["longitude"]
    if "location_name" in data:
        farm.location_name = data["location_name"]
    if "soil_type" in data:
        farm.soil_type = data["soil_type"]
    if "soil_type_source" in data:
        farm.soil_type_source = data["soil_type_source"]
    if "soil_region" in data:
        farm.soil_region = data["soil_region"]

    db.session.commit()

    return jsonify({
        "message": "Farm updated successfully.",
        "farm": farm.to_dict(),
    }), 200


@farms_bp.route("/<uuid:farm_id>", methods=["DELETE"])
@jwt_required()
@user_type_required("farmer")
def delete_farm(farm_id: uuid.UUID):
    """
    DELETE /api/farms/<farm_id>
    Deletes farm and cascades deletion to plots and crop cycles.
    Strict owner-only check: cross-user access returns 403 Forbidden.
    """
    farm = Farm.query.get(farm_id)
    if not farm:
        return jsonify({"error": "not_found", "message": "Farm not found."}), 404

    # Strict ownership check
    if farm.user_id != current_user.id:
        return jsonify({
            "error": "forbidden",
            "message": "You do not have permission to delete this farm.",
        }), 403

    db.session.delete(farm)
    db.session.commit()

    return jsonify({"message": "Farm and associated plots deleted successfully."}), 200
