import logging
from sqlalchemy.orm import Session
from models.campaign import Campaign, CampaignStatus
from models.enums import MessagingMode

logger = logging.getLogger(__name__)

class InvalidStateTransitionError(Exception):
    pass

class CampaignService:
    
    VALID_TRANSITIONS = {
        CampaignStatus.DRAFT: [CampaignStatus.QUEUED, CampaignStatus.CANCELED],
        CampaignStatus.QUEUED: [CampaignStatus.RUNNING, CampaignStatus.CANCELED, CampaignStatus.PAUSED],
        CampaignStatus.PAUSED: [CampaignStatus.QUEUED, CampaignStatus.CANCELED],
        CampaignStatus.RUNNING: [CampaignStatus.COMPLETED, CampaignStatus.FAILED, CampaignStatus.PAUSED, CampaignStatus.CANCELED],
        CampaignStatus.COMPLETED: [], # Terminal state
        CampaignStatus.FAILED: [CampaignStatus.QUEUED], # Allow retry from failure
        CampaignStatus.CANCELED: [], # Terminal state
    }

    @classmethod
    def transition_state(cls, db: Session, campaign: Campaign, new_status: CampaignStatus) -> bool:
        if new_status not in cls.VALID_TRANSITIONS.get(campaign.status, []):
            logger.error(f"Invalid transition from {campaign.status} to {new_status}")
            raise InvalidStateTransitionError(f"Cannot transition campaign from {campaign.status.value} to {new_status.value}")
        
        campaign.status = new_status
        db.commit()
        return True
