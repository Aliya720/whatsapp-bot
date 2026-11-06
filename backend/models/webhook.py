import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
import sqlalchemy as sa
from core.database import Base

class WebhookEvent(Base):
    """
    Idempotent webhook event store.
    Guarantees we never process the exact same webhook payload twice.
    """
    __tablename__ = "webhook_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    
    provider = Column(String(50), nullable=False) # e.g., 'meta_cloud'
    event_type = Column(String(100), nullable=False) # e.g., 'messages', 'statuses'
    external_event_id = Column(String(255), nullable=True, index=True)
    payload_hash = Column(String(255), nullable=False, index=True)
    
    payload = Column(JSON, nullable=False)
    
    processed = Column(Boolean, default=False, nullable=False)
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        # Ensure we never insert the exact same payload hash from the same provider twice
        sa.UniqueConstraint('provider', 'payload_hash', name='uq_webhook_payload'),
    )

class OrganizationMetaConfig(Base):
    """
    Stores non-sensitive Meta API configurations.
    Access tokens are stored strictly in AWS Secrets Manager and accessed via the secret manager service,
    never directly stored in plaintext in the database.
    """
    __tablename__ = "organization_meta_configs"
    
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    phone_number_id = Column(String(255), nullable=False)
    business_account_id = Column(String(255), nullable=False)
    webhook_verify_token = Column(String(255), nullable=False) # Safe to store here, used for challenge verification
    
    # ARN or reference identifier to fetch the secure token from AWS/KMS
    aws_secret_arn = Column(String(512), nullable=True) 
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
