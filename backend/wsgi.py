"""
Bhoomi backend — WSGI entry point and Celery worker entry point.
"""
import os

from app import create_app
from app.celery_app import make_celery

# Determine environment
env = os.getenv("FLASK_ENV", "development")

# Create Flask app
flask_app = create_app(env)

# Create Celery app bound to Flask context
celery_app = make_celery(flask_app)

# Alias for `flask run` / gunicorn
application = flask_app

if __name__ == "__main__":
    flask_app.run()
