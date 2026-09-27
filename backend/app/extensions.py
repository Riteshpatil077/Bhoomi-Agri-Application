"""
Bhoomi — Extension singletons
All Flask extension instances are created here and imported by the factory
and modules — never re-created elsewhere.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()

# Flask-Limiter reads RATELIMIT_STORAGE_URI from Flask config at init time.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per minute"],
    storage_uri=None,  # overridden by RATELIMIT_STORAGE_URI in app config
)
