import os
os.environ["USE_MOCK_PROVIDERS"] = "true"

from core.database import SessionLocal
from tasks.personal import process_personal_campaign
from models.campaign import Campaign, CampaignStatus

db = SessionLocal()
# Find a queued campaign
campaign = db.query(Campaign).filter(Campaign.status == CampaignStatus.QUEUED).first()

if campaign:
    print(f"Processing campaign: {campaign.id}")
    process_personal_campaign(str(campaign.id), str(campaign.org_id))
    db.refresh(campaign)
    print(f"Campaign status after processing: {campaign.status}, Sent: {campaign.sent_count}")
else:
    print("No queued campaigns found.")
db.close()
