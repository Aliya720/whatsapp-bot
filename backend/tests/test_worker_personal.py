import pytest
import os
from models.campaign import Campaign, CampaignStatus
from models.campaign_recipient import CampaignRecipient, RecipientStatus
from models.organization import Organization
from models.user import User
from models.recipient import Recipient
from models.enums import MessagingMode
from tasks.personal import process_personal_campaign

def test_personal_campaign_worker(db_session):
    # Ensure mock is enabled
    os.environ["USE_MOCK_PROVIDERS"] = "true"
    
    org = Organization(name="Test Org Worker")
    db_session.add(org)
    db_session.commit()

    recipient = Recipient(
        org_id=org.id, 
        phone_number="+19999999999",
        first_name="WorkerTest"
    )
    db_session.add(recipient)
    
    campaign = Campaign(
        org_id=org.id,
        mode=MessagingMode.PERSONAL,
        name="Worker Test Camp",
        message_template="Hi",
        status=CampaignStatus.QUEUED,
        total_recipients=1,
        valid_recipients=1
    )
    db_session.add(campaign)
    db_session.commit()
    
    cr = CampaignRecipient(
        campaign_id=campaign.id,
        recipient_id=recipient.id,
        personalized_message="Hi",
        status=RecipientStatus.PENDING
    )
    db_session.add(cr)
    db_session.commit()
    
    # Run the worker synchronously for testing
    process_personal_campaign(str(campaign.id), str(org.id))
    
    # Assert outcomes
    db_session.refresh(campaign)
    assert campaign.status == CampaignStatus.COMPLETED
    assert campaign.sent_count == 1
    
    db_session.refresh(cr)
    assert cr.status == RecipientStatus.SENT
