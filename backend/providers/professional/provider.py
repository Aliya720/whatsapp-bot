import os
import requests
import logging
from typing import Dict, Any, Optional
from providers.base import BaseProvider
from core.secrets import SecretsManager

logger = logging.getLogger(__name__)

class MetaClient:
    """
    Handles raw HTTP communication with the Meta WhatsApp Cloud API.
    """
    API_VERSION = "v19.0"
    BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
    
    def __init__(self, phone_number_id: str, access_token: str):
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        
    def send_text_message(self, to_phone: str, message: str) -> Optional[str]:
        """
        Sends a standard text message.
        Returns the provider_message_id if successful, raises exception otherwise.
        """
        url = f"{self.BASE_URL}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        # Meta requires phone numbers without the '+' sign
        clean_phone = to_phone.lstrip('+')
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message
            }
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code not in (200, 201):
            error_details = response.json()
            logger.error(f"[META CLOUD API ERROR] {response.status_code}: {error_details}")
            raise Exception(f"Meta API Error: {error_details.get('error', {}).get('message', 'Unknown Error')}")
            
        data = response.json()
        
        # Extract the Meta message ID (usually wamid...)
        messages = data.get("messages", [])
        if messages:
            return messages[0].get("id")
        return None

class MockProfessionalWhatsAppProvider(BaseProvider):
    def __init__(self):
        self.connected = False
        self.config = {}

    def connect(self, credentials: Dict[str, Any]) -> bool:
        self.config = credentials
        self.connected = True
        return True

    def send_message(self, recipient: str, message: str) -> bool:
        logger.info(f"[MOCK-PROFESSIONAL] Sent to {recipient} via Meta Cloud API.")
        # Simulating provider returning a wamid string
        return "wamid.mock-12345"

    def get_status(self) -> Dict[str, Any]:
        return {"mode": "professional", "connected": self.connected, "type": "mock_meta_api"}

class MetaWhatsAppCloudProvider(BaseProvider):
    """
    Professional Mode Provider for Meta WhatsApp Cloud API.
    """
    def __init__(self):
        self.client = None
        self.connected = False

    def connect(self, credentials: Dict[str, Any]) -> bool:
        """
        Credentials must contain: phone_number_id, aws_secret_arn
        """
        phone_number_id = credentials.get("phone_number_id")
        arn = credentials.get("aws_secret_arn")
        
        if not phone_number_id or not arn:
            logger.error("Missing required Meta configuration.")
            return False
            
        access_token = SecretsManager.get_meta_access_token(arn)
        if not access_token:
            logger.error("Failed to retrieve Meta access token from Secrets Manager.")
            return False
            
        self.client = MetaClient(phone_number_id=phone_number_id, access_token=access_token)
        
        # Test connection by doing a safe GET against the phone number endpoint
        try:
            res = requests.get(
                f"{self.client.BASE_URL}/{phone_number_id}", 
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=5
            )
            if res.status_code == 200:
                self.connected = True
                return True
            else:
                logger.error(f"Meta Connection Test Failed: {res.text}")
                return False
        except Exception as e:
            logger.error(f"Meta Connection Test Exception: {e}")
            return False

    def send_message(self, recipient: str, message: str) -> str:
        if not self.connected or not self.client:
            raise Exception("Provider not connected.")
            
        return self.client.send_text_message(recipient, message)

    def get_status(self) -> Dict[str, Any]:
        return {"mode": "professional", "connected": self.connected, "type": "meta_cloud_api"}
