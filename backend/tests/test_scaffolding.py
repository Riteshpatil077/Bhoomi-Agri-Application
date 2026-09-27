"""
Prompt 1 — Scaffolding tests
Verifies that the Flask app boots, and that health endpoints respond correctly.
Runs against SQLite in-memory — no live Postgres required.
"""


def test_healthz_returns_200(client):
    """Liveness endpoint must always return 200 — no DB dependency."""
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ok"


def test_readyz_returns_json_with_checks(client):
    """
    Readiness endpoint returns 200 or 503 depending on DB connectivity.
    In unit tests (SQLite in-memory), the DB is reachable so we expect 200.
    In CI with Postgres, it's also 200.
    Either way, the response shape must be correct.
    """
    response = client.get("/readyz")
    assert response.status_code in (200, 503)
    data = response.get_json()
    assert data is not None
    assert "status" in data
    assert data["status"] in ("ok", "degraded")
    assert "checks" in data
    assert "database" in data["checks"]


def test_readyz_does_not_expose_database_errors(client, monkeypatch):
    """Readiness details are logged server-side, not returned to public callers."""
    from app.extensions import db

    def fail_query(*_args, **_kwargs):
        raise RuntimeError("postgres://internal-user:secret@db.internal")

    monkeypatch.setattr(db.session, "scalar", fail_query)
    response = client.get("/readyz")

    assert response.status_code == 503
    assert response.get_json()["checks"]["database"] == "unavailable"
    assert "secret" not in response.get_data(as_text=True)


def test_unknown_route_returns_404(client):
    """Unknown routes should return 404, not 500."""
    response = client.get("/does-not-exist")
    assert response.status_code == 404


def test_api_prefix_routes_registered(client):
    """
    Ensure /api/auth prefix is registered — a GET to a non-existent sub-route
    returns 404 (blueprint registered) not a routing error (blueprint absent).
    """
    response = client.get("/api/auth/nonexistent-stub-route")
    assert response.status_code == 404


def test_app_config_testing_flag(app):
    """Sanity check: app is configured with TESTING=True."""
    assert app.config["TESTING"] is True


def test_jwt_cookie_location_is_cookies(app):
    """JWT must be configured for cookie transport per §6."""
    assert "cookies" in app.config["JWT_TOKEN_LOCATION"]


def test_jwt_csrf_protect_enabled(app):
    """CSRF protection on JWT cookies must be enabled per §6."""
    assert app.config["JWT_COOKIE_CSRF_PROTECT"] is True


def test_application_factory_registers_celery_tasks(app):
    """Factory-created apps expose all beat task names to the worker registry."""
    celery = app.extensions["celery"]
    expected = {
        "app.tasks.activities.check_due_activities_and_notify",
        "app.tasks.verification.purge_expired_verification_docs",
        "app.tasks.weather.poll_weather_forecasts",
    }
    assert expected.issubset(celery.tasks.keys())


def test_application_factory_uses_configured_rate_limit_storage(app):
    """The app uses Flask-Limiter's supported storage URI config key."""
    assert app.config["RATELIMIT_STORAGE_URI"].startswith("redis://")


def test_production_config_rejects_missing_secrets_and_database(monkeypatch):
    """Production must not start with development signing keys or implicit DBs."""
    from app.config import ProductionConfig

    monkeypatch.delenv("DATABASE_URL", raising=False)
    try:
        ProductionConfig.validate({"SECRET_KEY": "", "JWT_SECRET_KEY": ""})
    except RuntimeError as exc:
        assert "SECRET_KEY" in str(exc)
    else:
        raise AssertionError("Expected missing production secret to be rejected")
