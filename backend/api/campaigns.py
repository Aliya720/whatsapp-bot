from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.database import get_db
from models.user import User
from models.campaign import Campaign, CampaignStatus
from models.campaign_recipient import CampaignRecipient, RecipientStatus
from models.recipient import Recipient
from schemas.campaign import CampaignCreate, CampaignResponse, CampaignPreviewRequest, CampaignPreviewResponse
from api.deps import get_current_user
from services.personalization import PersonalizationService, PersonalizationError

router = APIRouter()

@router.post("/preview", response_model=CampaignPreviewResponse)
def preview_message(
    req: CampaignPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    recipient = db.query(Recipient).filter(
        Recipient.id == req.recipient_id,
        Recipient.org_id == current_user.org_id
    ).first()
    
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
        
    context = {
        "first_name": recipient.first_name,
        "last_name": recipient.last_name,
        "phone_number": recipient.phone_number,
        "company": recipient.company,
        "custom_data": recipient.custom_data
    }
    
    try:
        rendered = PersonalizationService.render(req.message_template, context)
        return CampaignPreviewResponse(rendered_message=rendered)
    except PersonalizationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/", response_model=CampaignResponse)
def create_campaign(
    campaign: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Fetch requested recipients to ensure they belong to this org
    recipients = db.query(Recipient).filter(
        Recipient.id.in_(campaign.recipient_ids),
        Recipient.org_id == current_user.org_id
    ).all()
    
    if not recipients:
        raise HTTPException(status_code=400, detail="No valid recipients found")

    # 2. Pre-validate the template against all selected recipients to prevent silent failure during broadcast
    valid_recipients = []
    for r in recipients:
        context = {
            "first_name": r.first_name,
            "last_name": r.last_name,
            "phone_number": r.phone_number,
            "company": r.company,
            "custom_data": r.custom_data
        }
        try:
            rendered = PersonalizationService.render(campaign.message_template, context)
            valid_recipients.append({
                "recipient_id": r.id,
                "rendered": rendered
            })
        except PersonalizationError:
            pass # We could log this or fail the whole creation, but normally we just exclude them or fail them.
            # Let's fail the creation entirely if *any* validation fails, forcing user to fix template or data.
            raise HTTPException(status_code=400, detail=f"Personalization failed for recipient {r.phone_number}")

    # 3. Create Campaign
    db_campaign = Campaign(
        org_id=current_user.org_id,
        created_by=current_user.id,
        mode=campaign.mode,
        messaging_profile_id=campaign.messaging_profile_id,
        name=campaign.name,
        message_template=campaign.message_template,
        status=CampaignStatus.QUEUED,
        total_recipients=len(recipients),
        valid_recipients=len(valid_recipients)
    )
    db.add(db_campaign)
    db.flush() # Get campaign ID
    
    # 4. Create Campaign Recipients
    for vr in valid_recipients:
        cr = CampaignRecipient(
            campaign_id=db_campaign.id,
            recipient_id=vr["recipient_id"],
            personalized_message=vr["rendered"],
            status=RecipientStatus.PENDING
        )
        db.add(cr)
        
    db.commit()
    db.refresh(db_campaign)
    
    from tasks.personal import process_personal_campaign
    from tasks.professional import process_professional_campaign
    from models.enums import MessagingMode
    
    if db_campaign.mode == MessagingMode.PERSONAL:
        process_personal_campaign.delay(str(db_campaign.id), str(current_user.org_id))
    elif db_campaign.mode == MessagingMode.PROFESSIONAL:
        process_professional_campaign.delay(str(db_campaign.id), str(current_user.org_id))
    
    return db_campaign

@router.get("/", response_model=List[CampaignResponse])
def list_campaigns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Campaign).filter(Campaign.org_id == current_user.org_id).order_by(Campaign.created_at.desc()).all()
