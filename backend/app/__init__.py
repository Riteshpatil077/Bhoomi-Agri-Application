"""
Bhoomi — Application Factory
Creates and configures the Flask application with all extensions and blueprints.
"""
from __future__ import annotations

import logging
import os

from flask import Flask, jsonify, Response

from .config import config_map
from .extensions import db, jwt, limiter, migrate, cors


def create_app(config_name: str | None = None) -> Flask:
    """Application factory — instantiates and wires up the Flask app."""
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_map[config_name])
    # A standalone local Flask server often runs without the Redis service
    # used by Docker Compose. Keep API requests (including CORS preflights)
    # available in that setup; development opts into Redis only through the
    # current RATELIMIT_STORAGE_URI setting. The legacy RATELIMIT_STORAGE_URL
    # alias remains supported by BaseConfig outside this local fallback.
    if (
        config_name == "development"
        and not os.environ.get("RATELIMIT_STORAGE_URI")
    ):
        app.config["RATELIMIT_STORAGE_URI"] = "memory://"

    if config_name == "production":
        # Read secrets at factory invocation, rather than relying on import-time
        # class attributes, so secret injection by the host is honored reliably.
        app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "")
        app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "")
        config_map[config_name].validate(app.config)

    # ------------------------------------------------------------------ #
    # Extensions                                                           #
    # ------------------------------------------------------------------ #
    db.init_app(app)
    migrate.init_app(app, db)
    from . import models  # Register all models with db metadata
    jwt.init_app(app)
    from .jwt_handlers import configure_jwt
    configure_jwt(app, jwt)
    limiter.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    # ------------------------------------------------------------------ #
    # Blueprints                                                           #
    # ------------------------------------------------------------------ #
    from .blueprints.health import health_bp
    from .blueprints.auth import auth_bp
    from .blueprints.admin import admin_bp
    from .blueprints.super_admin import super_admin_bp
    from .blueprints.verification import verification_bp
    from .blueprints.crops import crops_bp
    from .blueprints.farms import farms_bp
    from .blueprints.plots import plots_bp
    from .blueprints.crop_cycles import crop_cycles_bp
    from .blueprints.farm_activities import farm_activities_bp
    from .blueprints.notifications import notifications_bp
    from .blueprints.weather import weather_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(super_admin_bp, url_prefix="/api/super-admin")
    app.register_blueprint(verification_bp, url_prefix="/api/verification")
    app.register_blueprint(crops_bp, url_prefix="/api/crops")
    app.register_blueprint(farms_bp, url_prefix="/api/farms")
    app.register_blueprint(plots_bp, url_prefix="/api/plots")
    app.register_blueprint(crop_cycles_bp, url_prefix="/api/crop-cycles")
    app.register_blueprint(farm_activities_bp, url_prefix="/api/activities")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")
    app.register_blueprint(weather_bp, url_prefix="/api/weather")

    # Keep asynchronous work inside the same application factory lifecycle so
    # tests, CLI commands, and WSGI workers all receive the identical Celery setup.
    from .celery_app import make_celery
    make_celery(app)

    # ------------------------------------------------------------------ #
    # CLI commands                                                         #
    # ------------------------------------------------------------------ #
    from .cli import register_commands
    register_commands(app)

    # ------------------------------------------------------------------ #
    # Security headers (§9)                                                #
    # Applied to every response. See OWASP Secure Headers Project.         #
    # ------------------------------------------------------------------ #
    @app.after_request
    def set_security_headers(response: Response) -> Response:
        # Prevent MIME-type sniffing (§9)
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Forbid framing by any origin (clickjacking protection) (§9)
        response.headers["X-Frame-Options"] = "DENY"
        # Referrer leakage control
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Basic CSP — allow only same origin; tightened per deployment in prod.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        # Permissions policy — disable unnecessary browser APIs
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        # HSTS — only in production; skip if TESTING to avoid breaking test assertions.
        if not app.config.get("TESTING") and app.config.get("JWT_COOKIE_SECURE"):
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        return response

    # ------------------------------------------------------------------ #
    # Sentry observability (§9)                                            #
    # ------------------------------------------------------------------ #
    sentry_dsn = app.config.get("SENTRY_DSN", "")
    if sentry_dsn:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[
                FlaskIntegration(),
                SqlalchemyIntegration(),
            ],
            traces_sample_rate=0.1,  # 10% of requests traced
            send_default_pii=False,   # Never send PII to Sentry
        )

    # ------------------------------------------------------------------ #
    # Logging                                                              #
    # ------------------------------------------------------------------ #
    logging.basicConfig(
        level=logging.DEBUG if app.config.get("DEBUG") else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    return app
