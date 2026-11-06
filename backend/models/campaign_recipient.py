import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import sqlalchemy as sa
from core.database import Base
import enum

class RecipientStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"

class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("recipients.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Store the actual personalized message content computed before sending
    personalized_message = Column(Text, nullable=True)

    status = Column(SQLEnum(RecipientStatus, name="recipientstatus_enum", create_type=True), default=RecipientStatus.PENDING, nullable=False)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    campaign = relationship("Campaign", back_populates="recipients")
    recipient = relationship("Recipient")

    __table_args__ = (
        sa.UniqueConstraint('campaign_id', 'recipient_id', name='uq_campaign_recipient'),
    )
