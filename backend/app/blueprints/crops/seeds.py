"""
Bhoomi — Crop Catalog Seeds
Pre-seeds common crops with agronomic durations and categories per §4 & Prompt 6.
"""
from __future__ import annotations

import logging
from typing import List, Dict, Any
from app.extensions import db
from app.models.farm import CropCatalog

logger = logging.getLogger(__name__)

DEFAULT_CROPS: List[Dict[str, Any]] = [
    {"crop_name": "Wheat (Kanak)", "category": "Cereals", "typical_duration_days": 135},
    {"crop_name": "Rice (Paddy)", "category": "Cereals", "typical_duration_days": 120},
    {"crop_name": "Maize (Corn)", "category": "Cereals", "typical_duration_days": 100},
    {"crop_name": "Pearl Millet (Bajra)", "category": "Millets", "typical_duration_days": 85},
    {"crop_name": "Sorghum (Jowar)", "category": "Millets", "typical_duration_days": 110},
    {"crop_name": "Chickpea (Chana)", "category": "Pulses", "typical_duration_days": 105},
    {"crop_name": "Pigeon Pea (Arhar / Tur)", "category": "Pulses", "typical_duration_days": 170},
    {"crop_name": "Green Gram (Moong)", "category": "Pulses", "typical_duration_days": 65},
    {"crop_name": "Black Gram (Urad)", "category": "Pulses", "typical_duration_days": 75},
    {"crop_name": "Soybean", "category": "Oilseeds", "typical_duration_days": 100},
    {"crop_name": "Mustard (Sarson)", "category": "Oilseeds", "typical_duration_days": 115},
    {"crop_name": "Groundnut (Peanut)", "category": "Oilseeds", "typical_duration_days": 125},
    {"crop_name": "Cotton (Kapas)", "category": "Cash Crops", "typical_duration_days": 160},
    {"crop_name": "Sugarcane (Ganna)", "category": "Cash Crops", "typical_duration_days": 360},
    {"crop_name": "Potato (Aloo)", "category": "Vegetables", "typical_duration_days": 90},
    {"crop_name": "Tomato", "category": "Vegetables", "typical_duration_days": 85},
    {"crop_name": "Onion (Pyaz)", "category": "Vegetables", "typical_duration_days": 120},
    {"crop_name": "Chili (Mirch)", "category": "Spices", "typical_duration_days": 150},
]


def seed_crop_catalog() -> int:
    """
    Idempotently seeds standard crops into crop_catalog table.
    Returns count of newly inserted crops.
    """
    inserted = 0
    for crop_data in DEFAULT_CROPS:
        existing = CropCatalog.query.filter_by(crop_name=crop_data["crop_name"]).first()
        if not existing:
            crop = CropCatalog(
                crop_name=crop_data["crop_name"],
                category=crop_data["category"],
                typical_duration_days=crop_data["typical_duration_days"],
            )
            db.session.add(crop)
            inserted += 1

    if inserted > 0:
        db.session.commit()
        logger.info("Seeded %d crops into CropCatalog.", inserted)
    return inserted
