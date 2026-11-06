import pytest
from fastapi.testclient import TestClient
from main import app
from models.user import User
from models.organization import Organization
from models.recipient import Recipient
from core.security import create_access_token
import uuid

# Normally you'd use a robust pytest fixture setup. For speed we do an isolated test.
def test_campaign_validation_failure(client, db_session):
    # Setup Org, User, Recipient
    org = Organization(name="Test Org")
    db_session.add(org)
    db_session.commit()
    
    import uuid
    user = User(email=f"testcamp_{uuid.uuid4().hex[:6]}@test.com", hashed_password="x", org_id=org.id)
    db_session.add(user)
    db_session.commit()
    
    recipient = Recipient(
        org_id=org.id, 
        phone_number="+1234",
        first_name="Alice",
        custom_data={"vip": "yes"}
    )
    db_session.add(recipient)
    db_session.commit()
    
    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}
    
    # Attempt to create campaign with missing variable
    res = client.post("/campaigns/", headers=headers, json={
        "name": "Test Camp",
        "mode": "personal",
        "message_template": "Hello {{missing_var}}",
        "recipient_ids": [str(recipient.id)]
    })
    
    assert res.status_code == 400
    assert "Personalization failed" in res.json()["detail"]
