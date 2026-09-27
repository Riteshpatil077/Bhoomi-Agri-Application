"""
Bhoomi — Security Headers & Hardening Tests (§9)
Verifies that all OWASP secure response headers and configurations
are actively enforced on all responses.
"""
import pytest
from app import create_app


def test_security_headers_present_on_api_responses(client):
    """Verify security headers on standard HTTP responses."""
    resp = client.get("/healthz")
    assert resp.status_code == 200

    # MIME-sniffing protection (§9)
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"

    # Clickjacking protection (§9)
    assert resp.headers.get("X-Frame-Options") == "DENY"

    # Referrer policy (§9)
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    # Content-Security-Policy (§9)
    csp = resp.headers.get("Content-Security-Policy")
    assert csp is not None
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp

    # Permissions policy (§9)
    permissions = resp.headers.get("Permissions-Policy")
    assert permissions is not None
    assert "camera=()" in permissions
    assert "microphone=()" in permissions


def test_hsts_header_in_production_environment(monkeypatch):
    """Verify Strict-Transport-Security is emitted when JWT_COOKIE_SECURE is True in non-testing env."""
    monkeypatch.setenv("SECRET_KEY", "test-production-secret-key-with-more-than-32-bytes")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-production-jwt-secret-key-with-more-than-32-bytes")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
    prod_app = create_app("production")
    prod_app.config["TESTING"] = False
    with prod_app.test_client() as prod_client:
        resp = prod_client.get("/healthz")
        assert resp.status_code == 200
        assert "Strict-Transport-Security" in resp.headers
        hsts = resp.headers["Strict-Transport-Security"]
        assert "max-age=31536000" in hsts
        assert "includeSubDomains" in hsts
        assert "preload" in hsts


def test_cors_preflight_configuration(client):
    """Verify CORS handles OPTIONS request correctly with credentials support."""
    resp = client.open(
        "/api/auth/me",
        method="OPTIONS",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    # Status code 200 for CORS preflight
    assert resp.status_code == 200
    assert resp.headers.get("Access-Control-Allow-Credentials") == "true"


def test_development_cors_preflight_without_local_redis(monkeypatch):
    """A local Flask run can answer browser preflights when Redis is not running."""
    monkeypatch.delenv("RATELIMIT_STORAGE_URI", raising=False)
    # Existing local .env files may still set the legacy URL name even when
    # the Redis service is not running.
    monkeypatch.setenv("RATELIMIT_STORAGE_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    dev_app = create_app("development")
    assert dev_app.config["RATELIMIT_STORAGE_URI"] == "memory://"

    with dev_app.test_client() as dev_client:
        preflight = dev_client.open(
            "/api/auth/me",
            method="OPTIONS",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type,x-csrftoken",
            },
        )
        response = dev_client.get(
            "/api/auth/me",
            headers={"Origin": "http://localhost:5173"},
        )

    assert preflight.status_code == 200
    assert preflight.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
    assert preflight.headers.get("Access-Control-Allow-Credentials") == "true"
    assert "x-csrftoken" in preflight.headers.get("Access-Control-Allow-Headers", "").lower()
    # An unauthenticated session restore is expected to return 401, but it must
    # still be a readable CORS response so the client can handle it normally.
    assert response.status_code == 401
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"
