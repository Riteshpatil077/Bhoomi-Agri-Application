"""
Bhoomi — Weather Service Client
Fetches hyperlocal weather forecasts and agronomic advisories from licensed APIs per §8.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

import httpx
from flask import current_app
from app.models.base import utc_now

logger = logging.getLogger(__name__)

REGION_COORDINATES = {
    "IN-MH-PUN": (18.5204, 73.8567),
    "IN-MH-NAS": (19.9975, 73.7898),
    "IN-MH-NAG": (21.1458, 79.0882),
    "IN-MH-AUR": (19.8762, 75.3433),
    "IN-MH-KOL": (16.7050, 74.2433),
    "IN-MH-SOL": (17.6599, 75.9064),
    "IN-KA-BLR": (12.9716, 77.5946),
    "IN-PB-LDH": (30.9000, 75.8573),
    "IN-GJ-AHM": (23.0225, 72.5714),
    "IN-MP-IND": (22.7196, 75.8577),
}


class WeatherFetchError(Exception):
    """Raised when weather API call fails."""
    pass


class WeatherService:
    """Client for weather API integrations with provenance tracking."""

    @classmethod
    def search_city(cls, city: str) -> list[Dict[str, Any]]:
        """Resolve a city name to provider-supplied coordinates and labels."""
        api_key = current_app.config.get("WEATHER_API_KEY")
        api_url = current_app.config.get("WEATHER_API_URL", "https://api.openweathermap.org/data/2.5")
        if not api_key:
            raise WeatherFetchError("Weather provider is not configured.")
        try:
            base_url = api_url.rsplit("/data/", 1)[0]
            response = httpx.get(
                f"{base_url}/geo/1.0/direct",
                params={"q": city, "limit": 5, "appid": api_key},
                timeout=10.0,
            )
            response.raise_for_status()
            results = response.json()
            return [
                {
                    "name": item["name"],
                    "state": item.get("state"),
                    "country": item.get("country"),
                    "latitude": float(item["lat"]),
                    "longitude": float(item["lon"]),
                }
                for item in results
                if item.get("name") and item.get("lat") is not None and item.get("lon") is not None
            ]
        except Exception as exc:
            # Provider exception strings can contain the query URL, including
            # the API key. Keep credentials out of logs.
            logger.error("Failed to resolve weather city (%s)", type(exc).__name__)
            raise WeatherFetchError("City search is temporarily unavailable.") from exc

    @classmethod
    def fetch_forecast_for_region(
        cls,
        region_code: str,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> Dict[str, Any]:
        """
        Fetches current forecast for a region or coordinates.
        Never fabricates data on source failure per §8.
        """
        api_key = current_app.config.get("WEATHER_API_KEY")
        api_url = current_app.config.get("WEATHER_API_URL")

        # Tests use a clearly marked fixture. Missing credentials in a real
        # environment must be reported as unavailable, never as live weather.
        if current_app.config.get("TESTING"):
            now = utc_now()
            return {
                "region_code": region_code,
                "source_name": "Test Fixture",
                "source_url": None,
                "source_updated_at": now,
                "valid_until": now + timedelta(hours=6),
                "is_official": False,
                "payload": {
                    "temperature_celsius": 28.5,
                    "condition": "Partly Cloudy",
                    "humidity_percent": 65,
                    "precipitation_probability_percent": 20,
                    "wind_speed_kmh": 12.0,
                    "uv_index": 6,
                    "advisory": "Favorable conditions for vegetative growth. No immediate spray delay needed.",
                    "coordinates": {"latitude": latitude or 18.5204, "longitude": longitude or 73.8567},
                },
            }

        if not api_key:
            raise WeatherFetchError("Weather provider is not configured.")

        if latitude is None or longitude is None:
            if region_code.startswith("GEO-"):
                try:
                    _, lat_text, lon_text = region_code.split("-", 2)
                    latitude, longitude = float(lat_text), float(lon_text)
                except (ValueError, TypeError):
                    pass
            if latitude is None or longitude is None:
                latitude, longitude = REGION_COORDINATES.get(region_code, (None, None))
        if latitude is None or longitude is None:
            raise WeatherFetchError(f"No coordinates configured for weather region {region_code}.")

        try:
            params = {
                "lat": latitude,
                "lon": longitude,
                "appid": api_key,
                "units": "metric",
            }
            response = httpx.get(f"{api_url}/weather", params=params, timeout=10.0)
            response.raise_for_status()
            data = response.json()

            now = utc_now()
            observed_at = datetime.fromtimestamp(data["dt"], tz=timezone.utc) if data.get("dt") else now
            return {
                "region_code": region_code,
                "source_name": "OpenWeather / Licensed Ag Feed",
                "source_url": "https://openweathermap.org",
                "source_updated_at": observed_at,
                "valid_until": now + timedelta(hours=3),
                "is_official": False,
                "payload": {
                    "temperature_celsius": data.get("main", {}).get("temp"),
                    "condition": data.get("weather", [{}])[0].get("description", "Unknown").title(),
                    "humidity_percent": data.get("main", {}).get("humidity"),
                    "cloud_cover_percent": data.get("clouds", {}).get("all"),
                    "wind_speed_kmh": round(data.get("wind", {}).get("speed", 0) * 3.6, 1),
                    "coordinates": {"latitude": latitude, "longitude": longitude},
                },
            }
        except Exception as exc:
            logger.error("Failed to fetch weather from upstream source for %s (%s)", region_code, type(exc).__name__)
            raise WeatherFetchError(f"Upstream weather source unavailable: {exc}") from exc
