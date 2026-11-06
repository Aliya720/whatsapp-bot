from core.worker import celery_app
from providers.factory import ProviderFactory
from models.enums import MessagingMode
from core.database import SessionLocal
from models.campaign import Campaign, CampaignStatus
from models.campaign_recipient import CampaignRecipient, RecipientStatus
from models.message_log import MessageLog
from services.campaign import CampaignService, InvalidStateTransitionError
import time
import logging
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

class PersonalRetryPolicy:
    """
    Retry policy for Personal Mode worker.
    Uses exponential backoff for transient errors.
    """
    max_retries = 3
    countdown = 30 # seconds (exponentially increased in celery via retry_backoff)

def lock_and_fetch_pending_recipient(db: Session, campaign_id: str):
    """
    Idempotency & Concurrency:
    Uses SELECT ... FOR UPDATE SKIP LOCKED to ensure multiple worker threads/processes
    cannot grab the same recipient concurrently.
    """
    return db.query(CampaignRecipient).filter(
        CampaignRecipient.campaign_id == campaign_id,
        CampaignRecipient.status == RecipientStatus.PENDING
    ).with_for_update(skip_locked=True).first()

@celery_app.task(
    name="personal.process_campaign",
    bind=True,
    max_retries=PersonalRetryPolicy.max_retries,
    autoretry_for=(OperationalError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=300
)
def process_personal_campaign(self, campaign_id: str, org_id: str):
    """
    Processes an entire campaign using the Personal Provider.
    """
    db = SessionLocal()
    try:
        # Lock campaign to prevent concurrent worker execution
        campaign = db.query(Campaign).filter(
            Campaign.id == campaign_id, 
            Campaign.mode == MessagingMode.PERSONAL
        ).with_for_update(skip_locked=True).first()
        
        if not campaign:
            logger.info(f"Campaign {campaign_id} already locked or does not exist.")
            return

        # Enforce State Machine
        try:
            if campaign.status == CampaignStatus.QUEUED:
                CampaignService.transition_state(db, campaign, CampaignStatus.RUNNING)
                campaign.started_at = time.strftime('%Y-%m-%d %H:%M:%S')
                db.commit()
            elif campaign.status != CampaignStatus.RUNNING:
                logger.info(f"Campaign {campaign_id} is in {campaign.status}, skipping execution.")
                return
        except InvalidStateTransitionError:
            return

        provider = ProviderFactory.get_provider(MessagingMode.PERSONAL)
        credentials = {"org_id": org_id, "profile_id": campaign.messaging_profile_id or "default"}
        
        try:
            connected = provider.connect(credentials)
            if not connected:
                # Transient error - retry
                raise ConnectionError("Personal WhatsApp session is not connected or invalid.")
                
            while True:
                # Concurrency Control: Fetch one pending recipient with a DB lock
                cr = lock_and_fetch_pending_recipient(db, campaign_id)
                if not cr:
                    break # No more pending recipients
                    
                try:
                    success = provider.send_message(cr.recipient.phone_number, cr.personalized_message)
                    
                    if success:
                        cr.status = RecipientStatus.SENT
                        campaign.sent_count += 1
                        
                        log = MessageLog(
                            org_id=org_id,
                            campaign_id=campaign_id,
                            recipient_phone=cr.recipient.phone_number,
                            status="sent",
                            provider_payload={"provider": "personal_browser", "note": "Sent successfully"}
                        )
                        db.add(log)
                    else:
                        cr.status = RecipientStatus.FAILED
                        cr.error_message = "Provider returned false without exception."
                        campaign.failed_count += 1
                        
                except Exception as e:
                    # Permanent error for this specific user (e.g. invalid number)
                    logger.error(f"Failed to send to {cr.recipient.phone_number}: {e}")
                    cr.status = RecipientStatus.FAILED
                    cr.error_message = str(e)
                    campaign.failed_count += 1

                db.commit()
                time.sleep(8)
                
        except ConnectionError as ce:
            # Re-raise to trigger Celery autoretry
            raise ce
        except Exception as e:
            # Permanent failure of the entire campaign process
            CampaignService.transition_state(db, campaign, CampaignStatus.FAILED)
            raise e
        finally:
            provider.disconnect()
            
        # Check if all are processed
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
