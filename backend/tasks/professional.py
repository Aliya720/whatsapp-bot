from core.worker import celery_app
from providers.factory import ProviderFactory
from models.enums import MessagingMode
from core.database import SessionLocal
from models.campaign import Campaign, CampaignStatus
from models.campaign_recipient import CampaignRecipient, RecipientStatus
from models.webhook import OrganizationMetaConfig
from models.message_log import MessageLog
from services.campaign import CampaignService, InvalidStateTransitionError
import time
import logging
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
import requests

logger = logging.getLogger(__name__)

class ProfessionalRetryPolicy:
    """
    Retry policy for Professional Mode worker.
    Uses exponential backoff for transient errors (e.g., Meta Cloud timeouts).
    """
    max_retries = 5
    countdown = 10 

def lock_and_fetch_pending_recipient(db: Session, campaign_id: str):
    """
    Idempotency & Concurrency:
    Uses SELECT ... FOR UPDATE SKIP LOCKED.
    """
    return db.query(CampaignRecipient).filter(
        CampaignRecipient.campaign_id == campaign_id,
        CampaignRecipient.status == RecipientStatus.PENDING
    ).with_for_update(skip_locked=True).first()

@celery_app.task(
    name="professional.process_campaign",
    bind=True,
    max_retries=ProfessionalRetryPolicy.max_retries,
    autoretry_for=(OperationalError, requests.exceptions.RequestException),
    retry_backoff=True,
    retry_backoff_max=300
)
def process_professional_campaign(self, campaign_id: str, org_id: str):
    """
    Processes an entire campaign using the Professional Provider (Meta Cloud API).
    """
    db = SessionLocal()
    try:
        # Lock campaign
        campaign = db.query(Campaign).filter(
            Campaign.id == campaign_id, 
            Campaign.mode == MessagingMode.PROFESSIONAL
        ).with_for_update(skip_locked=True).first()
        
        if not campaign:
            return

        try:
            if campaign.status == CampaignStatus.QUEUED:
                CampaignService.transition_state(db, campaign, CampaignStatus.RUNNING)
                campaign.started_at = time.strftime('%Y-%m-%d %H:%M:%S')
                db.commit()
            elif campaign.status != CampaignStatus.RUNNING:
                return
        except InvalidStateTransitionError:
            return

        config = db.query(OrganizationMetaConfig).filter(OrganizationMetaConfig.org_id == org_id).first()
        if not config:
            CampaignService.transition_state(db, campaign, CampaignStatus.FAILED)
            return

        provider = ProviderFactory.get_provider(MessagingMode.PROFESSIONAL)
        
        try:
            connected = provider.connect({
                "phone_number_id": config.phone_number_id,
                "aws_secret_arn": config.aws_secret_arn
            })
            
            if not connected:
                raise requests.exceptions.ConnectionError("Professional WhatsApp session failed to connect.")
                
            while True:
                cr = lock_and_fetch_pending_recipient(db, campaign_id)
                if not cr:
                    break
                    
                try:
                    wamid = provider.send_message(cr.recipient.phone_number, cr.personalized_message)
                    
                    if wamid:
                        cr.status = RecipientStatus.SENT
                        campaign.sent_count += 1
                        
                        log = MessageLog(
                            org_id=org_id,
                            campaign_id=campaign_id,
                            recipient_phone=cr.recipient.phone_number,
                            provider_message_id=wamid,
                            status="sent",
                            provider_payload={"provider": "meta_cloud", "wamid": wamid}
                        )
                        db.add(log)
                    else:
                        cr.status = RecipientStatus.FAILED
                        cr.error_message = "Provider returned no message ID."
                        campaign.failed_count += 1
                        
                except Exception as e:
                    cr.status = RecipientStatus.FAILED
                    cr.error_message = str(e)
                    campaign.failed_count += 1

                db.commit()
                time.sleep(0.05)
                
        except requests.exceptions.RequestException as re:
            # Re-raise for Celery backoff retry
            raise re
        except Exception as e:
            CampaignService.transition_state(db, campaign, CampaignStatus.FAILED)
            raise e
        finally:
            provider.disconnect()
            
        pending = db.query(CampaignRecipient).filter(
            CampaignRecipient.campaign_id == campaign_id,
            CampaignRecipient.status == RecipientStatus.PENDING
        ).count()
        
        if pending == 0:
            CampaignService.transition_state(db, campaign, CampaignStatus.COMPLETED)
            campaign.completed_at = time.strftime('%Y-%m-%d %H:%M:%S')
            db.commit()

    finally:
        db.close()
