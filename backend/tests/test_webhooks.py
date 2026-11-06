import pytest
from models.webhook import WebhookEvent
import json

def test_webhook_idempotency(db_session, client):
    # Setup verify token
    from models.webhook import OrganizationMetaConfig
    from models.organization import Organization
    
    org = Organization(name="Test Org")
    db_session.add(org)
    db_session.commit()
    
    import uuid
    random_id = str(uuid.uuid4())
    config = OrganizationMetaConfig(
        org_id=org.id,
        phone_number_id=random_id,
        business_account_id="456",
        webhook_verify_token="test_token"
    )
    db_session.add(config)
    db_session.commit()

    # 1. Test Verification (hub.challenge)
    res_verify = client.get("/professional/webhook?hub.mode=subscribe&hub.verify_token=test_token&hub.challenge=112233")
    assert res_verify.status_code == 200
    assert res_verify.text == "112233"

    # 2. Test Post Event
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {"display_phone_number": "123", "phone_number_id": random_id},
                    "statuses": [{
                        "id": f"wamid.{random_id}",
                        "status": "delivered",
                        "timestamp": "1234567890",
                        "recipient_id": "19999999999"
                    }]
                },
                "field": "messages"
            }]
        }]
    }
    
    # First post
    res1 = client.post("/professional/webhook", json=payload)
    assert res1.status_code == 200
    
    events = db_session.query(WebhookEvent).filter(WebhookEvent.org_id == org.id).all()
    assert len(events) == 1
    assert events[0].processed == True # Since there's no matching message log, it processes and passes
    
    # Second post (duplicate)
    res2 = client.post("/professional/webhook", json=payload)
    assert res2.status_code == 200
    assert res2.json() == {"status": "ok", "message": "Already processed"}
    
    # Still only 1 event recorded
    events_after = db_session.query(WebhookEvent).all()
    assert len(events_after) == 1
