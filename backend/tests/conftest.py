import pytest
from fastapi.testclient import TestClient
from main import app
from core.database import SessionLocal, Base, engine

@pytest.fixture(scope="session")
def client():
    # Only for tests
    return TestClient(app)

@pytest.fixture(scope="function")
def db_session():
    session = SessionLocal()
    # Begin a nested transaction (savepoint)
    session.begin_nested()
    try:
        yield session
    finally:
        # Rollback the transaction to keep the DB clean
        session.rollback()
        session.close()
