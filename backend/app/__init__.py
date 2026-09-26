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

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    # Phase 2+ blueprints registered here as they are built.

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
