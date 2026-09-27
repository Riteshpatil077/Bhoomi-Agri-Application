"""
Bhoomi — Weather Blueprint Routes
Surfaces verified forecasts and agronomic advisories with provenance per §8 & Prompt 8.
Guarantees:
  - Transparent provenance metadata (source_name, source_updated_at, valid_until)
  - Explicit distinction between current vs stale data
  - If source fails and data is expired: returns "data unavailable, last known good at X"
"""
from __future__ import annotations

from flask import jsonify, request
from flask_jwt_extended import jwt_required

from app.models.base import utc_now
from datetime import timezone
from app.models.weather import WeatherAdvisory
from app.utils.weather import WeatherService, WeatherFetchError

from . import weather_bp


def _to_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@weather_bp.route("/cities", methods=["GET"])
@jwt_required(optional=True)
def search_cities():
    """Return provider-backed city suggestions for the weather search box."""
    query = (request.args.get("q") or "").strip()
    if len(query) < 2 or len(query) > 100:
        return jsonify({"suggestions": [], "message": "Enter at least 2 characters."}), 200
    try:
        suggestions = [
            city for city in WeatherService.search_city(query)
            if city.get("country") == "IN"
            and city.get("name", "").casefold().startswith(query.casefold())
        ]
    except WeatherFetchError:
        return jsonify({"suggestions": [], "message": "City suggestions are temporarily unavailable."}), 200
    return jsonify({"suggestions": suggestions}), 200


@weather_bp.route("/forecast", methods=["GET"])
@jwt_required(optional=True)
def get_forecast():
    """
    GET /api/weather/forecast
    Returns current or last-known-good forecast for a region or coordinates.
    Query params: region (default 'IN-MH-PUN'), latitude, longitude.
    """
    region = request.args.get("region", "IN-MH-PUN")
    city = (request.args.get("city") or "").strip()
    lat = request.args.get("latitude", type=float)
    lon = request.args.get("longitude", type=float)

    # A city search is resolved and fetched on every request. This prevents a
    # stale preset-region record from being shown for a different city.
    if city:
        if len(city) < 2 or len(city) > 100:
            return jsonify({"status": "not_found", "message": "Enter a city name between 2 and 100 characters.", "forecast": None, "provenance": None}), 400
        try:
            matches = WeatherService.search_city(city)
        except WeatherFetchError:
            return jsonify({
                "status": "unavailable", "is_stale": True,
                "message": "City search is unavailable because the weather provider could not be reached.",
                "forecast": None, "provenance": None,
            }), 200
        if not matches:
            return jsonify({
                "status": "not_found", "is_stale": False,
                "message": f"No city matching '{city}' was found.",
                "forecast": None, "provenance": None,
            }), 200

        location = matches[0]
        lat, lon = location["latitude"], location["longitude"]
        # Rounded coordinate key keeps forecasts for different cities apart.
        region = f"CITY-{lat:.3f}-{lon:.3f}"
        try:
            fetched = WeatherService.fetch_forecast_for_region(region, latitude=lat, longitude=lon)
            from app.extensions import db
            latest = WeatherAdvisory(
                region_code=region,
                source_name=fetched["source_name"],
                data_type=WeatherAdvisory.DATA_TYPE_FORECAST,
                payload=fetched["payload"],
                source_updated_at=fetched["source_updated_at"],
                valid_until=fetched["valid_until"],
            )
            db.session.add(latest)
            db.session.commit()
        except WeatherFetchError:
            latest = (
                WeatherAdvisory.query
                .filter_by(region_code=region, data_type=WeatherAdvisory.DATA_TYPE_FORECAST)
                .order_by(WeatherAdvisory.source_updated_at.desc())
                .first()
            )
            if latest is None:
                return jsonify({
                    "status": "unavailable", "is_stale": True,
                    "message": f"Weather is unavailable for {location['name']}; no previous forecast is available.",
                    "forecast": None, "provenance": None, "location": location,
                }), 200

        now = utc_now()
        valid_until = _to_utc(latest.valid_until)
        source_updated_at = _to_utc(latest.source_updated_at)
        is_valid = valid_until >= now
        source_time_str = source_updated_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        provenance = {
            "source_name": latest.source_name,
            "source_updated_at": source_updated_at.isoformat(),
            "valid_until": valid_until.isoformat(),
            "region_code": latest.region_code,
            "is_official": latest.source_name.lower().startswith("india meteorological department"),
        }
        return jsonify({
            "status": "current" if is_valid else "stale",
            "is_stale": not is_valid,
            "message": (f"Current forecast for {location['name']}." if is_valid else
                        f"Data unavailable, last known good at {source_time_str}"),
            "forecast": latest.to_dict(),
            "provenance": provenance,
            "location": location,
        }), 200

    # If coordinates provided but no specific region, derive a geo key
    if lat is not None and lon is not None and region == "IN-MH-PUN":
        region = f"GEO-{round(lat, 2)}-{round(lon, 2)}"

    now = utc_now()

    # Query latest forecast record for this region
    latest = (
        WeatherAdvisory.query
        .filter_by(region_code=region, data_type=WeatherAdvisory.DATA_TYPE_FORECAST)
        .order_by(WeatherAdvisory.source_updated_at.desc())
        .first()
    )

    # If no record exists, attempt on-demand fetch
    if not latest:
        try:
            fetched = WeatherService.fetch_forecast_for_region(region, latitude=lat, longitude=lon)
            from app.extensions import db
            latest = WeatherAdvisory(
                region_code=region,
                source_name=fetched["source_name"],
                data_type=WeatherAdvisory.DATA_TYPE_FORECAST,
                payload=fetched["payload"],
                source_updated_at=fetched["source_updated_at"],
                valid_until=fetched["valid_until"],
            )
            db.session.add(latest)
            db.session.commit()
        except WeatherFetchError:
            return jsonify({
                "status": "unavailable",
                "is_stale": True,
                "message": "Data unavailable. No previous records found for this region.",
                "forecast": None,
                "provenance": None,
            }), 200

    # Determine validity per §8
    valid_until = _to_utc(latest.valid_until)
    source_updated_at = _to_utc(latest.source_updated_at)
    is_valid = valid_until >= now
    source_time_str = source_updated_at.strftime("%Y-%m-%d %H:%M:%S UTC")

    provenance = {
        "source_name": latest.source_name,
        "source_updated_at": source_updated_at.isoformat(),
        "valid_until": valid_until.isoformat(),
        "region_code": latest.region_code,
        "is_official": latest.source_name.lower().startswith("india meteorological department"),
    }

    if is_valid:
        return jsonify({
            "status": "current",
            "is_stale": False,
            "message": "Current forecast from the configured weather provider.",
            "forecast": latest.to_dict(),
            "provenance": provenance,
        }), 200
    else:
        # §8: "return 'data unavailable, last known good at X' rather than fabricating data on source failure"
        return jsonify({
            "status": "stale",
            "is_stale": True,
            "message": f"Data unavailable, last known good at {source_time_str}",
            "forecast": latest.to_dict(),
            "provenance": provenance,
        }), 200


@weather_bp.route("/advisories", methods=["GET"])
@jwt_required(optional=True)
def list_advisories():
    """
    GET /api/weather/advisories
    Returns list of agronomic advisories for a region.
    """
    region = request.args.get("region", "IN-MH-PUN")
    now = utc_now()

    advisories = (
        WeatherAdvisory.query
        .filter_by(region_code=region, data_type=WeatherAdvisory.DATA_TYPE_ADVISORY)
        .order_by(WeatherAdvisory.source_updated_at.desc())
        .limit(20)
        .all()
    )

    results = []
    for a in advisories:
        d = a.to_dict()
        vu = _to_utc(a.valid_until)
        d["is_valid"] = vu >= now
        results.append(d)

    return jsonify({
        "advisories": results,
        "region": region,
        "total": len(results),
    }), 200
