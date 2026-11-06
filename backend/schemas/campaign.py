from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from models.enums import MessagingMode
from models.campaign import CampaignStatus

class CampaignBase(BaseModel):
    name: str
    mode: MessagingMode
    messaging_profile_id: Optional[str] = None
    message_template: str

class CampaignCreate(CampaignBase):
    # During creation, user selects recipient IDs
    recipient_ids: List[UUID]

class CampaignResponse(CampaignBase):
    id: UUID
    org_id: UUID
    status: CampaignStatus
    total_recipients: int
    valid_recipients: int
    sent_count: int
    delivered_count: int
    read_count: int
    failed_count: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class CampaignPreviewRequest(BaseModel):
    message_template: str
    recipient_id: UUID

class CampaignPreviewResponse(BaseModel):
    rendered_message: str
