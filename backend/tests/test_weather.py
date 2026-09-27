"""
Bhoomi — Weather & Advisory Test Suite (Prompt 8)
Covers §8 (External Data Quality Rules, provenance fields, no fabricated data),
Prompt 8 success criteria:
  - Celery task pulling from licensed weather API on schedule
  - Storing source name, source-updated timestamp, region, validity window
  - Read endpoint surfaces provenance fields
  - Read endpoint returns 'data unavailable, last known good at X' when data is expired/stale
  - Upstream source failures handled gracefully without fabricating data
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest

from app.models.base import utc_now


# --------------------------------------------------------------------------- #
# 1. Weather Polling Celery Task Tests                                        #
# --------------------------------------------------------------------------- #

class TestWeatherPollingTask:
    """Tests for Celery task app.tasks.weather.poll_weather_forecasts."""

    def test_poll_weather_forecasts_success(self, app):
        """Task pulls forecast from licensed source and saves with provenance fields."""
        from app.extensions import db
        from app.models.weather import WeatherAdvisory
        from app.tasks.weather import poll_weather_forecasts

        with app.app_context():
            result = poll_weather_forecasts()
            assert result["status"] == "success"
            assert result["updated_regions"] >= 1

            # Check record stored in DB with provenance (§8)
            advisory = (
                WeatherAdvisory.query
                .filter_by(data_type=WeatherAdvisory.DATA_TYPE_FORECAST)
                .order_by(WeatherAdvisory.source_updated_at.desc())
                .first()
            )
            assert advisory is not None
            assert advisory.source_name is not None
            assert advisory.source_updated_at is not None
            assert advisory.valid_until is not None
            assert advisory.valid_until > advisory.source_updated_at
            assert "temperature_celsius" in advisory.payload
            assert "condition" in advisory.payload

    def test_poll_weather_handles_upstream_failure_without_fabrication(self, app):
        """
        When upstream source fails, error is logged and NO corrupted/fabricated
        records are written (§8).
        """
        from app.extensions import db
        from app.models.weather import WeatherAdvisory
        from app.tasks.weather import poll_weather_forecasts
        from app.utils.weather import WeatherFetchError

        with app.app_context():
            initial_count = WeatherAdvisory.query.count()

            # Mock upstream weather fetch error
            with patch("app.utils.weather.WeatherService.fetch_forecast_for_region") as mock_fetch:
                mock_fetch.side_effect = WeatherFetchError("503 Service Unavailable")
                result = poll_weather_forecasts()

                assert result["updated_regions"] == 0
                assert result["failed_regions"] > 0
                # DB count unchanged (no fabricated data)
                assert WeatherAdvisory.query.count() == initial_count


# --------------------------------------------------------------------------- #
# 2. Weather Read Endpoints & Provenance Tests                                #
# --------------------------------------------------------------------------- #

class TestWeatherEndpoints:
    """Tests for GET /api/weather/forecast and GET /api/weather/advisories."""

    def test_forecast_endpoint_returns_current_provenance(self, app, client):
        """Returns 200 with current status and complete provenance when within validity window."""
        from app.extensions import db
        from app.models.weather import WeatherAdvisory

        now = utc_now()
        region = "IN-MH-TEST-01"

        with app.app_context():
            adv = WeatherAdvisory(
                id=uuid.uuid4(),
                region_code=region,
                source_name="India Meteorological Department (IMD)",
                data_type=WeatherAdvisory.DATA_TYPE_FORECAST,
                payload={
                    "temperature_celsius": 31.0,
                    "condition": "Clear Sky",
                    "humidity_percent": 50,
                },
                source_updated_at=now,
                valid_until=now + timedelta(hours=4),
            )
            db.session.add(adv)
            db.session.commit()

        resp = client.get(f"/api/weather/forecast?region={region}")
        assert resp.status_code == 200
        data = resp.get_json()

        # Check status and provenance fields (§8)
        assert data["status"] == "current"
        assert data["is_stale"] is False
        assert "provenance" in data
        prov = data["provenance"]
        assert prov["source_name"] == "India Meteorological Department (IMD)"
        assert prov["source_updated_at"] is not None
        assert prov["valid_until"] is not None
        assert prov["region_code"] == region
        assert prov["is_official"] is True

        # Forecast payload surfaced
        assert data["forecast"]["payload"]["temperature_celsius"] == 31.0

    def test_forecast_endpoint_returns_stale_message_when_expired(self, app, client):
        """
        Prompt 8 requirement: When validity window expires, return
        'data unavailable, last known good at X' rather than fabricating data.
        """
        from app.extensions import db
        from app.models.weather import WeatherAdvisory

        past_update = utc_now() - timedelta(days=2)
        expired_validity = utc_now() - timedelta(days=1)
        region = "IN-MH-EXPIRED-01"

        with app.app_context():
            adv = WeatherAdvisory(
                id=uuid.uuid4(),
                region_code=region,
                source_name="IMD Agro-Meteorological Unit",
                data_type=WeatherAdvisory.DATA_TYPE_FORECAST,
                payload={
                    "temperature_celsius": 26.0,
                    "condition": "Light Rain",
                },
                source_updated_at=past_update,
                valid_until=expired_validity,
            )
            db.session.add(adv)
            db.session.commit()

        resp = client.get(f"/api/weather/forecast?region={region}")
        assert resp.status_code == 200
        data = resp.get_json()

        # Must be marked stale with explicit last-known-good message (§8)
        assert data["status"] == "stale"
        assert data["is_stale"] is True
        assert "Data unavailable, last known good at" in data["message"]
        expected_utc_time = past_update.astimezone(timezone.utc).strftime(
            "%Y-%m-%d %H:%M:%S UTC"
        )
        assert data["message"].endswith(expected_utc_time)
        assert data["provenance"]["source_updated_at"].endswith("+00:00")

        # Last known good payload is still provided for reference
        assert data["forecast"] is not None
        assert data["provenance"]["source_name"] == "IMD Agro-Meteorological Unit"

    def test_advisories_endpoint_lists_agronomic_alerts(self, app, client):
        """GET /api/weather/advisories lists regional agronomic advisories."""
        from app.extensions import db
        from app.models.weather import WeatherAdvisory

        region = "IN-MH-ADV-01"
        now = utc_now()

        with app.app_context():
            adv = WeatherAdvisory(
                id=uuid.uuid4(),
                region_code=region,
                source_name="State Agriculture University Extension",
                data_type=WeatherAdvisory.DATA_TYPE_ADVISORY,
                payload={
                    "title": "Fall Armyworm Alert in Maize",
                    "severity": "High",
                    "recommended_action": "Scout fields and apply neem-based biopesticide if infestation exceeds 5%.",
                },
                source_updated_at=now,
                valid_until=now + timedelta(days=7),
            )
            db.session.add(adv)
            db.session.commit()

        resp = client.get(f"/api/weather/advisories?region={region}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total"] >= 1
        assert data["advisories"][0]["payload"]["severity"] == "High"
        assert data["advisories"][0]["is_valid"] is True

    def test_city_search_fetches_weather_for_resolved_city(self, app, client):
        """City searches use their resolved coordinates instead of a preset cache."""
        from app.utils.weather import WeatherService

        location = {
            "name": "Mumbai", "state": "Maharashtra", "country": "IN",
            "latitude": 19.076, "longitude": 72.8777,
        }
        with patch.object(WeatherService, "search_city", return_value=[location]), patch.object(
            WeatherService, "fetch_forecast_for_region", wraps=WeatherService.fetch_forecast_for_region
        ) as fetch:
            response = client.get("/api/weather/forecast?city=Mumbai")

        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "current"
        assert data["location"]["name"] == "Mumbai"
        assert data["forecast"]["payload"]["coordinates"] == {
            "latitude": 19.076, "longitude": 72.8777,
        }
        fetch.assert_called_once()

    def test_city_search_returns_not_found_for_unmatched_city(self, client):
        from app.utils.weather import WeatherService

        with patch.object(WeatherService, "search_city", return_value=[]):
            response = client.get("/api/weather/forecast?city=NoSuchCity")

        assert response.status_code == 200
        assert response.get_json()["status"] == "not_found"

    def test_city_suggestions_returns_provider_locations(self, client):
        from app.utils.weather import WeatherService

        locations = [{
            "name": "Nashik", "state": "Maharashtra", "country": "IN",
            "latitude": 19.9975, "longitude": 73.7898,
        }]
        with patch.object(WeatherService, "search_city", return_value=locations):
            response = client.get("/api/weather/cities?q=Nas")

        assert response.status_code == 200
        assert response.get_json()["suggestions"] == locations


def test_weather_service_reports_missing_provider_key_as_unavailable(app):
    """A non-test environment must not turn hard-coded fixture data into a forecast."""
    from app.utils.weather import WeatherFetchError, WeatherService

    with app.app_context():
        app.config["TESTING"] = False
        app.config["WEATHER_API_KEY"] = ""
        with pytest.raises(WeatherFetchError, match="not configured"):
            WeatherService.fetch_forecast_for_region("IN-MH-PUN")
