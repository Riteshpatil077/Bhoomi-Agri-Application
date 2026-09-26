"""
Bhoomi — Crop Catalog Routes
Exposes read-only catalog endpoints per §4 & Prompt 6.
"""
from __future__ import annotations

import uuid
from flask import jsonify, request
from flask_jwt_extended import jwt_required

from app.models.farm import CropCatalog
from .seeds import seed_crop_catalog
from . import crops_bp


@crops_bp.route("", methods=["GET"])
@jwt_required(optional=True)
def list_crops():
    """
    GET /api/crops
    Returns all crops in the reference catalog.
    Query params: category, search.
    Auto-seeds if table is currently empty.
    """
    if CropCatalog.query.count() == 0:
        seed_crop_catalog()

    category = request.args.get("category")
    search = request.args.get("search")

    query = CropCatalog.query
    if category:
        query = query.filter_by(category=category)
    if search:
        query = query.filter(CropCatalog.crop_name.ilike(f"%{search}%"))

    crops = query.order_by(CropCatalog.category.asc(), CropCatalog.crop_name.asc()).all()
    return jsonify({
        "crops": [c.to_dict() for c in crops],
        "total": len(crops),
    }), 200


@crops_bp.route("/<uuid:crop_id>", methods=["GET"])
@jwt_required(optional=True)
def get_crop(crop_id: uuid.UUID):
    """
    GET /api/crops/<crop_id>
    Returns single crop details.
    """
    crop = CropCatalog.query.get(crop_id)
    if not crop:
        return jsonify({"error": "not_found", "message": "Crop not found in catalog."}), 404

    return jsonify({"crop": crop.to_dict()}), 200


@crops_bp.route("/seed", methods=["POST"])
@jwt_required()
def trigger_seed_crops():
    """
    POST /api/crops/seed
    Seeds reference crops into catalog.
    """
    inserted = seed_crop_catalog()
    return jsonify({
        "message": f"Seeding complete. {inserted} new crops added.",
        "inserted": inserted,
    }), 200
