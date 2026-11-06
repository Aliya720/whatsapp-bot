import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import sqlalchemy as sa
from core.database import Base

class MessageLog(Base):
    """
    Append-only log for strict traceability of all outgoing messages,
    bounces, read receipts, and provider webhooks.
    """
    __tablename__ = "message_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    
    recipient_phone = Column(String(50), nullable=False, index=True)
    
    # external ID provided by the WhatsApp provider
    provider_message_id = Column(String(255), nullable=True, index=True)
    
    status = Column(String(50), nullable=False) # sent, delivered, read, failed
    
    # Raw webhook or API response data
    provider_payload = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    organization = relationship("Organization")
    campaign = relationship("Campaign")
