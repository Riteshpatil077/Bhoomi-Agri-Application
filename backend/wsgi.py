"""
Bhoomi backend — WSGI entry point and Celery worker entry point.
"""
import os
from dotenv import load_dotenv

# Load local environment variables from .env if present
load_dotenv()

from app import create_app

# Determine environment
env = os.getenv("FLASK_ENV", "development")

# Create Flask app
flask_app = create_app(env)

# Celery is created by the application factory and bound to its app context.
celery_app = flask_app.extensions["celery"]

# Alias for `flask run` / gunicorn
application = flask_app

if __name__ == "__main__":
    flask_app.run()
