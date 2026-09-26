"""
Bhoomi — Environment-based configuration classes
Never put secrets in this file — they come from environment variables injected
at container start from the managed secrets store.
"""
from __future__ import annotations

import os
from datetime import timedelta


class BaseConfig:
    # ------------------------------------------------------------------ #
    # Core                                                                 #
    # ------------------------------------------------------------------ #
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "bhoomi-dev-secret-key-32-bytes-long-min!!")
    DEBUG: bool = False
    TESTING: bool = False

    # ------------------------------------------------------------------ #
    # Database                                                             #
    # ------------------------------------------------------------------ #
    _db_uri = os.environ.get(
        "DATABASE_URL",
        "postgresql://bhoomi:bhoomi@localhost:5432/bhoomi_db",
    )
    SQLALCHEMY_DATABASE_URI: str = _db_uri
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    SQLALCHEMY_ENGINE_OPTIONS: dict = (
        {"connect_args": {"check_same_thread": False}}
        if _db_uri.startswith("sqlite")
        else {
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "pool_size": 10,
            "max_overflow": 20,
        }
    )

    # ------------------------------------------------------------------ #
    # Redis / Celery                                                       #
    # ------------------------------------------------------------------ #
    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND: str = os.environ.get("CELERY_RESULT_BACKEND", REDIS_URL)

    # Rate-limiter storage
    RATELIMIT_STORAGE_URL: str = os.environ.get(
        "RATELIMIT_STORAGE_URL", REDIS_URL
    )
    RATELIMIT_HEADERS_ENABLED: bool = True

    # ------------------------------------------------------------------ #
    # JWT (§6)                                                             #
    # ------------------------------------------------------------------ #
    JWT_SECRET_KEY: str = os.environ.get(
        "JWT_SECRET_KEY", "bhoomi-jwt-dev-secret-key-32-bytes-min!!"
    )
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES: timedelta = timedelta(days=7)
    # Tokens travel as httpOnly, Secure, SameSite=Strict cookies (§6).
    JWT_TOKEN_LOCATION: list[str] = ["cookies"]
    JWT_COOKIE_SECURE: bool = True          # must be True in prod (TLS)
    JWT_COOKIE_SAMESITE: str = "Strict"
    JWT_COOKIE_CSRF_PROTECT: bool = True    # Flask-JWT-Extended built-in CSRF
    JWT_ACCESS_COOKIE_NAME: str = "access_token_cookie"
    JWT_REFRESH_COOKIE_NAME: str = "refresh_token_cookie"
    JWT_CSRF_CHECK_FORM: bool = False
    JWT_CSRF_METHODS: list[str] = ["POST", "PUT", "PATCH", "DELETE"]

    # ------------------------------------------------------------------ #
    # CORS                                                                 #
    # ------------------------------------------------------------------ #
    CORS_ORIGINS: list[str] = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173"
    ).split(",")

    # ------------------------------------------------------------------ #
    # Object Storage (§5)                                                  #
    # ------------------------------------------------------------------ #
    AWS_REGION: str = os.environ.get("AWS_REGION", "ap-south-1")
    S3_BUCKET_PUBLIC: str = os.environ.get("S3_BUCKET_PUBLIC", "bhoomi-public-media")
    S3_BUCKET_PRIVATE: str = os.environ.get(
        "S3_BUCKET_PRIVATE", "bhoomi-verification-private"
    )
    PRESIGNED_URL_EXPIRY_UPLOAD: int = 300   # 5 min
    PRESIGNED_URL_EXPIRY_DOWNLOAD: int = 300 # 5 min — review GET URLs

    # ------------------------------------------------------------------ #
    # Verification doc retention (§5)                                     #
    # ------------------------------------------------------------------ #
    VERIFICATION_DOC_RETENTION_DAYS: int = int(
        os.environ.get("VERIFICATION_DOC_RETENTION_DAYS", "30")
    )

    # ------------------------------------------------------------------ #
    # External services                                                    #
    # ------------------------------------------------------------------ #
    WEATHER_API_KEY: str = os.environ.get("WEATHER_API_KEY", "")
    WEATHER_API_URL: str = os.environ.get(
        "WEATHER_API_URL", "https://api.openweathermap.org/data/2.5"
    )

    # ------------------------------------------------------------------ #
    # Sentry                                                               #
    # ------------------------------------------------------------------ #
    SENTRY_DSN: str = os.environ.get("SENTRY_DSN", "")


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    JWT_COOKIE_SECURE = False  # Allow HTTP in local dev


class TestingConfig(BaseConfig):
    TESTING = True
    DEBUG = True
    JWT_COOKIE_SECURE = False
    # Default to SQLite in-memory so unit tests pass without a live Postgres.
    # CI passes TEST_DATABASE_URL=postgresql://... to test against real Postgres.
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        "TEST_DATABASE_URL",
        "sqlite://",   # :memory: — shared in-memory db for the session
    )
    # SQLite doesn't support pool_size/max_overflow — clear engine options.
    SQLALCHEMY_ENGINE_OPTIONS: dict = {
        "connect_args": {"check_same_thread": False},
    }
    RATELIMIT_ENABLED: bool = False  # Disable rate-limiting in tests
    WTF_CSRF_ENABLED: bool = False


class ProductionConfig(BaseConfig):
    JWT_COOKIE_SECURE = True
    # In production, SECRET_KEY and JWT_SECRET_KEY MUST be set via secrets manager.


config_map: dict[str, type[BaseConfig]] = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    # Default alias
    "default": DevelopmentConfig,
}
