from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from core.database import get_db
from models.user import User
from models.campaign import Campaign
from models.campaign_recipient import CampaignRecipient
from api.deps import get_current_user
import csv
from io import StringIO
from datetime import datetime

router = APIRouter()

@router.get("/export")
def export_campaign_report(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.org_id == current_user.org_id
    ).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    recipients = db.query(CampaignRecipient).filter(
        CampaignRecipient.campaign_id == campaign_id
    ).all()

    # Generate CSV
    output = StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "Mode", "Campaign Name", "Recipient Phone", "First Name", "Last Name", 
        "Status", "Error Message", "Created At"
    ])

    for cr in recipients:
        writer.writerow([
            campaign.mode.value,
            campaign.name,
            cr.recipient.phone_number,
            cr.recipient.first_name or "",
            cr.recipient.last_name or "",
            cr.status.value,
            cr.error_message or "",
            cr.created_at.isoformat() if cr.created_at else ""
        ])

    output.seek(0)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"report_{campaign.name}_{timestamp}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
