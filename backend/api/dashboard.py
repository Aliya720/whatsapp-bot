from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from core.database import get_db
from models.user import User
from models.campaign import Campaign
from models.enums import MessagingMode
from api.deps import get_current_user
from providers.factory import ProviderFactory

router = APIRouter()

@router.get("/stats")
def get_dashboard_stats(
    mode: MessagingMode = MessagingMode.PERSONAL,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Aggregated stats for the specified mode
    stats = db.query(
        func.count(Campaign.id).label("total_campaigns"),
        func.sum(Campaign.sent_count).label("total_sent"),
        func.sum(Campaign.delivered_count).label("total_delivered"),
        func.sum(Campaign.failed_count).label("total_failed")
    ).filter(
        Campaign.org_id == current_user.org_id,
        Campaign.mode == mode
    ).first()

    total_campaigns = stats.total_campaigns or 0
    total_sent = stats.total_sent or 0
    total_delivered = stats.total_delivered or 0
    total_failed = stats.total_failed or 0

    return {
        "mode": mode.value,
        "total_campaigns": total_campaigns,
        "total_sent": total_sent,
        "total_delivered": total_delivered,
        "total_failed": total_failed,
    }
