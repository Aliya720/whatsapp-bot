import os
import pytest
from unittest.mock import patch
from models.campaign import Campaign, CampaignStatus
from models.campaign_recipient import CampaignRecipient, RecipientStatus
from models.organization import Organization
from models.enums import MessagingMode
from tasks.personal import process_personal_campaign
from tasks.professional import process_professional_campaign
from services.campaign import InvalidStateTransitionError, CampaignService
from requests.exceptions import ConnectionError
from core.database import SessionLocal

def test_campaign_state_machine():
    db_session = SessionLocal()
    org = Organization(name="State Test Org")
    db_session.add(org)
    db_session.commit()
    
    camp = Campaign(
        org_id=org.id,
        mode=MessagingMode.PERSONAL,
        name="State Test",
        message_template="test",
        status=CampaignStatus.DRAFT,
        total_recipients=1,
        valid_recipients=1
    )
    db_session.add(camp)
    db_session.commit()
    
    # Valid
    assert CampaignService.transition_state(db_session, camp, CampaignStatus.QUEUED) == True
    assert camp.status == CampaignStatus.QUEUED
    
    # Invalid transition (e.g. COMPLETED to RUNNING)
    camp.status = CampaignStatus.COMPLETED
    db_session.commit()
    
    with pytest.raises(InvalidStateTransitionError):
        CampaignService.transition_state(db_session, camp, CampaignStatus.RUNNING)

def test_concurrency_skip_locked():
    db_session = SessionLocal()
    """
    Simulates fetching a recipient using skip_locked=True.
    Since we can't easily mock concurrent transactions in a simple pytest run without threads,
    we ensure the SQL syntax `FOR UPDATE SKIP LOCKED` doesn't crash the query.
    """
    from tasks.personal import lock_and_fetch_pending_recipient
    
    org = Organization(name="Lock Test Org")
    db_session.add(org)
    db_session.commit()
    
    camp = Campaign(
        org_id=org.id,
        mode=MessagingMode.PERSONAL,
        name="Lock Test",
        message_template="test",
        status=CampaignStatus.QUEUED,
        total_recipients=1,
        valid_recipients=1
    )
    db_session.add(camp)
    db_session.commit()
    
    # Run the query
    cr = lock_and_fetch_pending_recipient(db_session, str(camp.id))
    assert cr is None # No recipients yet

@patch('providers.professional.provider.MockProfessionalWhatsAppProvider.connect')
def test_professional_worker_transient_failure(mock_connect):
    from requests.exceptions import ConnectionError
    db_session = SessionLocal()
    """
    Simulates a Meta Cloud API timeout/connection failure.
    Ensures the exception is propagated out (which Celery intercepts for exponential backoff)
    and the campaign is NOT marked as completely FAILED immediately if it's an autoretry_for exception.
    """
    mock_connect.side_effect = ConnectionError("Simulated Meta Timeout")
    
    # Setup
    org = Organization(name="Prof Failure Org")
    db_session.add(org)
    db_session.commit()
    
    from models.webhook import OrganizationMetaConfig
    config = OrganizationMetaConfig(
        org_id=org.id,
        phone_number_id="123",
        business_account_id="456",
        webhook_verify_token="mock_token",
        aws_secret_arn="mock_arn"
    )
    db_session.add(config)
    
    camp = Campaign(
        org_id=org.id,
        mode=MessagingMode.PROFESSIONAL,
        name="Prof Failure",
        message_template="test",
        status=CampaignStatus.QUEUED,
        total_recipients=1,
        valid_recipients=1
    )
    db_session.add(camp)
    db_session.commit()
    
    os.environ["USE_MOCK_PROVIDERS"] = "true"
    # We call the core function (not .delay()) to capture the exception
    from requests.exceptions import ConnectionError
    with pytest.raises(ConnectionError):
        process_professional_campaign(str(camp.id), str(org.id))
        
    db_session.refresh(camp)
    # Status should be RUNNING because it locked and started, but failed midway and threw.
    # Celery will retry it because it threw ConnectionError.
    assert camp.status == CampaignStatus.RUNNING

@patch('providers.personal.provider.MockPersonalWhatsAppProvider.connect')
def test_personal_worker_permanent_failure(mock_connect):
    db_session = SessionLocal()
    """
    Simulates an unknown/permanent exception. The worker should transition the campaign to FAILED.
    """
    mock_connect.side_effect = ValueError("Fatal Error")
    
    org = Organization(name="Per Failure Org")
    db_session.add(org)
    db_session.commit()
    
    camp = Campaign(
        org_id=org.id,
        mode=MessagingMode.PERSONAL,
        name="Per Failure",
        message_template="test",
        status=CampaignStatus.QUEUED,
        total_recipients=1,
        valid_recipients=1
    )
    db_session.add(camp)
    db_session.commit()
    
    os.environ["USE_MOCK_PROVIDERS"] = "true"
    
    with pytest.raises(ValueError):
        process_personal_campaign(str(camp.id), str(org.id))
        
    db_session.refresh(camp)
    assert camp.status == CampaignStatus.FAILED
