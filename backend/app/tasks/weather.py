"""
Bhoomi — Weather Polling Celery Task
Periodically polls licensed weather feeds and stores advisories with provenance per §8 & Prompt 8.
"""
from __future__ import annotations

import logging
from typing import Any, List

from app.celery_app import celery
from app.extensions import db
from app.models.weather import WeatherAdvisory
from app.models.farm import Farm
from app.utils.weather import WeatherService, WeatherFetchError

logger = logging.getLogger(__name__)

DEFAULT_REGIONS = ["IN-MH-PUN", "IN-KA-BLR", "IN-PB-LDH", "IN-GJ-AHM", "IN-MP-IND"]


@celery.task(name="app.tasks.weather.poll_weather_forecasts")
def poll_weather_forecasts() -> dict[str, Any]:
    """
    Periodic job that pulls forecast data from licensed feeds for all active regions.
    Stores full provenance: source_name, source_updated_at, valid_until.
    Never fabricates data on source failure per §8.
    """
    # Collect regions from registered farms or fallback defaults
    regions = set(DEFAULT_REGIONS)
    farms_with_coords = Farm.query.filter(Farm.latitude.isnot(None), Farm.longitude.isnot(None)).all()
    for f in farms_with_coords:
        # Approximate region code based on coordinates or farm state
        region_key = f"GEO-{round(f.latitude, 2)}-{round(f.longitude, 2)}"
        regions.add(region_key)

    updated_count = 0
    errors = []

    for region in regions:
        try:
            forecast_data = WeatherService.fetch_forecast_for_region(region_code=region)

            advisory = WeatherAdvisory(
                region_code=region,
                source_name=forecast_data["source_name"],
                data_type=WeatherAdvisory.DATA_TYPE_FORECAST,
                payload=forecast_data["payload"],
                source_updated_at=forecast_data["source_updated_at"],
                valid_until=forecast_data["valid_until"],
            )
            db.session.add(advisory)
            updated_count += 1
        except WeatherFetchError as exc:
            logger.warning("Weather fetch failed for region %s: %s", region, exc)
            errors.append({"region": region, "error": str(exc)})
        except Exception as exc:
            logger.error("Unexpected error saving weather for %s: %s", region, exc)
            errors.append({"region": region, "error": str(exc)})

    if updated_count > 0:
        db.session.commit()
        logger.info("Updated weather forecasts for %d regions.", updated_count)

    return {
        "status": "success" if not errors else "partial",
        "updated_regions": updated_count,
        "failed_regions": len(errors),
        "errors": errors,
    }
