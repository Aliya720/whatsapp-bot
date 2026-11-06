import uuid
from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base

class Organization(Base):
    """
    Organization represents the root multi-tenant boundary.
    All users and campaigns belong to an Organization.
    This prevents cross-tenant data leakage by scoping all queries to org_id.
    """
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
