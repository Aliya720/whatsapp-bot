import pytest
from api.health import health_check

def test_health_check():
    response = health_check()
    assert response == {"status": "healthy"}
