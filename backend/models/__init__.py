from core.database import Base
from .organization import Organization
from .user import User
from .recipient import Recipient
from .template import Template
from .campaign import Campaign
from .campaign_recipient import CampaignRecipient
from .message_log import MessageLog
from .webhook import WebhookEvent, OrganizationMetaConfig

# Importing models here ensures Alembic can discover them for migrations.
