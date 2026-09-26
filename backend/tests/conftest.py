"""
Bhoomi — pytest configuration and shared fixtures.
Uses SQLite in-memory by default (TestingConfig default) so tests pass
without a live Postgres. CI uses TEST_DATABASE_URL for real Postgres tests.
"""
from __future__ import annotations

import pytest


@pytest.fixture(scope="session")
def app():
    """Create a Flask application configured for testing (SQLite in-memory)."""
    from app import create_app
    from app.extensions import db as _db

    application = create_app("testing")

    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


@pytest.fixture(scope="session")
def client(app):
    """A test client for the Flask application."""
    return app.test_client()


@pytest.fixture(scope="function", autouse=True)
def db_session(app):
    """
    Provide an isolated DB session for each test.
    Rolls back after each test to keep tests independent.
    """
    from app.extensions import db as _db

    with app.app_context():
        yield _db.session
        _db.session.rollback()
