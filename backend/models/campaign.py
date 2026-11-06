import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import sqlalchemy as sa
from core.database import Base
from models.enums import MessagingMode
import enum

class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Mode is immutable. Prevents cross-contamination.
    mode = Column(SQLEnum(MessagingMode, name="messagingmode_enum", create_type=False), nullable=False)
    
    # Profile ID representing the specific WhatsApp account/number sending the messages
    messaging_profile_id = Column(String(255), nullable=True) 

    name = Column(String(255), nullable=False)
    message_template = Column(Text, nullable=False)
    
    status = Column(SQLEnum(CampaignStatus, name="campaignstatus_enum", create_type=True), default=CampaignStatus.DRAFT, nullable=False)

    # Statistics
    total_recipients = Column(Integer, default=0, nullable=False)
    valid_recipients = Column(Integer, default=0, nullable=False)
    sent_count = Column(Integer, default=0, nullable=False)
    delivered_count = Column(Integer, default=0, nullable=False)
    read_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    organization = relationship("Organization")
    creator = relationship("User")
    recipients = relationship("CampaignRecipient", back_populates="campaign", cascade="all, delete-orphan")
