"""
Bhoomi — Application Factory
Creates and configures the Flask application with all extensions and blueprints.
"""
from __future__ import annotations

import logging
import os

from flask import Flask, jsonify

from .config import config_map
from .extensions import db, jwt, limiter, migrate, cors


def create_app(config_name: str | None = None) -> Flask:
    """Application factory — instantiates and wires up the Flask app."""
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_map[config_name])

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

    # ------------------------------------------------------------------ #
    # CLI commands                                                         #
    # ------------------------------------------------------------------ #
    from .cli import register_commands
    register_commands(app)

    # ------------------------------------------------------------------ #
    # Logging                                                              #
    # ------------------------------------------------------------------ #
    logging.basicConfig(
        level=logging.DEBUG if app.config.get("DEBUG") else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    return app
