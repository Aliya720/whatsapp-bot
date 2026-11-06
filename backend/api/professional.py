from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from core.database import get_db
from models.user import User
from models.webhook import OrganizationMetaConfig, WebhookEvent
from models.message_log import MessageLog
from models.campaign_recipient import CampaignRecipient, RecipientStatus
from api.deps import get_current_user
from core.secrets import SecretsManager
from providers.factory import ProviderFactory
from models.enums import MessagingMode
import hashlib
import json

router = APIRouter()

@router.get("/config")
def get_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    config = db.query(OrganizationMetaConfig).filter(OrganizationMetaConfig.org_id == current_user.org_id).first()
    if not config:
        return {"configured": False}
    return {
        "configured": True,
        "phone_number_id": config.phone_number_id,
        "business_account_id": config.business_account_id,
        "webhook_verify_token": config.webhook_verify_token
        # Notice we explicitly DO NOT return the access token ARN or value
    }

@router.post("/config")
def save_config(
    payload: dict,
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    phone = payload.get("phone_number_id")
    biz = payload.get("business_account_id")
    token = payload.get("access_token")
    verify = payload.get("webhook_verify_token")
    
    if not phone or not biz or not token or not verify:
        raise HTTPException(status_code=400, detail="Missing configuration parameters")

    arn = SecretsManager.store_meta_access_token(str(current_user.org_id), token)
    
    config = db.query(OrganizationMetaConfig).filter(OrganizationMetaConfig.org_id == current_user.org_id).first()
    if not config:
        config = OrganizationMetaConfig(
            org_id=current_user.org_id,
            phone_number_id=phone,
            business_account_id=biz,
            webhook_verify_token=verify,
            aws_secret_arn=arn
        )
        db.add(config)
    else:
        config.phone_number_id = phone
        config.business_account_id = biz
        config.webhook_verify_token = verify
        config.aws_secret_arn = arn
        
    db.commit()
    return {"message": "Configuration saved securely"}

@router.post("/test-connection")
def test_connection(
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    config = db.query(OrganizationMetaConfig).filter(OrganizationMetaConfig.org_id == current_user.org_id).first()
    if not config:
        raise HTTPException(status_code=400, detail="Configuration not saved")
        
    provider = ProviderFactory.get_provider(MessagingMode.PROFESSIONAL)
    connected = provider.connect({
        "phone_number_id": config.phone_number_id,
        "aws_secret_arn": config.aws_secret_arn
    })
    
    if not connected:
        # Provide a safe, obfuscated error message
        raise HTTPException(status_code=400, detail="Failed to connect to Meta Cloud API. Please verify your Access Token and Phone Number ID.")
        
    return {"message": "Connection successful"}

# Webhook Endpoints
@router.get("/webhook")
def verify_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Handles Meta's hub.challenge verification.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    
    if mode == "subscribe" and token:
        config = db.query(OrganizationMetaConfig).filter(OrganizationMetaConfig.webhook_verify_token == token).first()
        if config:
            return Response(content=challenge, media_type="text/plain", status_code=200)
            
    return Response(content="Forbidden", status_code=403)

@router.post("/webhook")
async def receive_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Receives incoming webhook events.
    Idempotent design: Never process the same event twice.
    """
    body = await request.json()
    
    # Payload hash to ensure absolute idempotency
    payload_str = json.dumps(body, sort_keys=True)
    payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    
    # Check if we already processed this
    existing = db.query(WebhookEvent).filter(
        WebhookEvent.provider == 'meta_cloud',
        WebhookEvent.payload_hash == payload_hash
    ).first()
    
    if existing:
        return {"status": "ok", "message": "Already processed"}
        
    # Attempt to extract external_event_id (Usually wamid for status updates)
    external_id = None
    try:
        entries = body.get("entry", [])
        if entries:
            changes = entries[0].get("changes", [])
            if changes:
                value = changes[0].get("value", {})
                statuses = value.get("statuses", [])
                if statuses:
                    external_id = statuses[0].get("id")
    except Exception:
        pass
        
    event = WebhookEvent(
        provider='meta_cloud',
        event_type='whatsapp_business_account',
        external_event_id=external_id,
        payload_hash=payload_hash,
        payload=body,
        processed=False
    )
    db.add(event)
    db.commit()
    
    # Process it
    if external_id:
        # It's a status update (delivered, read, failed)
        try:
            status_obj = body["entry"][0]["changes"][0]["value"]["statuses"][0]
            wamid = status_obj["id"]
            status_type = status_obj["status"] # sent, delivered, read, failed
            
            # Find the corresponding message log
            log = db.query(MessageLog).filter(MessageLog.provider_message_id == wamid).first()
            if log:
                # Add a new audit log entry for this lifecycle change
                new_log = MessageLog(
                    org_id=log.org_id,
                    campaign_id=log.campaign_id,
                    recipient_phone=log.recipient_phone,
                    provider_message_id=wamid,
                    status=status_type,
                    provider_payload=body
                )
                db.add(new_log)
                
                # Update the CampaignRecipient state
                # Find the recipient
                cr = db.query(CampaignRecipient).filter(
                    CampaignRecipient.campaign_id == log.campaign_id,
                    CampaignRecipient.recipient.has(phone_number=log.recipient_phone)
                ).first()
                
                if cr:
                    if status_type == "delivered":
                        cr.status = RecipientStatus.DELIVERED
                    elif status_type == "read":
                        cr.status = RecipientStatus.READ
                    elif status_type == "failed":
                        cr.status = RecipientStatus.FAILED
                        # Parse error
                        errs = status_obj.get("errors", [])
                        if errs:
                            cr.error_message = errs[0].get("title", "Unknown Webhook Error")
                            
            event.processed = True
            
        except Exception as e:
            # Leave processed=False for dead-letter queuing or manual inspection
            print(f"Webhook processing error: {e}")
            pass
            
    db.commit()
    
    return {"status": "ok"}
