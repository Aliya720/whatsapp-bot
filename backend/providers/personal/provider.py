"""
providers/personal/provider.py

Personal WhatsApp Provider
───────────────────────────
Two implementations:

1. RealPersonalWhatsAppProvider  (production / USE_MOCK_PROVIDERS=false)
   Delegates all WhatsApp operations to the Node.js wa-sidecar service
   running at WA_SIDECAR_URL. The sidecar manages headless browser sessions
   using whatsapp-web.js with real QR codes from WhatsApp's servers.

2. MockPersonalWhatsAppProvider  (development / USE_MOCK_PROVIDERS=true)
   No network calls. Used for unit tests and local development when you do
   not want to spin up the sidecar.
"""

import os
import logging
import requests
from typing import Dict, Any, Optional

from providers.base import BaseProvider

logger = logging.getLogger(__name__)

# URL of the Node.js sidecar service. Overridden in docker-compose.yml.
WA_SIDECAR_URL = os.getenv("WA_SIDECAR_URL", "http://wa-sidecar:3001")
SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "change-me-in-production")
SIDECAR_TIMEOUT = int(os.getenv("WA_SIDECAR_TIMEOUT", "10"))  # seconds


def _sidecar_headers() -> Dict[str, str]:
    return {"X-Api-Key": SIDECAR_API_KEY, "Content-Type": "application/json"}


class RealPersonalWhatsAppProvider(BaseProvider):
    """
    Production personal provider. Delegates to the wa-sidecar Node.js service.
    """

    def __init__(self):
        self.connected = False
        self.org_id: Optional[str] = None

    def connect(self, credentials: Dict[str, Any]) -> bool:
        org_id = credentials.get("org_id")
        if not org_id:
            logger.error("[PERSONAL] connect() called without org_id")
            return False

        self.org_id = str(org_id)

        try:
            # Use GET for status check
            resp = requests.get(
                f"{WA_SIDECAR_URL}/session/{self.org_id}/status",
                headers=_sidecar_headers(),
                timeout=SIDECAR_TIMEOUT,
            )
            if resp.status_code == 200:
                data = resp.json()
                self.connected = data.get("connected", False)
                if self.connected:
                    logger.info(f"[PERSONAL] Session for org {self.org_id} is already connected")
                    return True

            logger.warning(f"[PERSONAL] Session for org {self.org_id} not connected. Status: {resp.text}")
            return False

        except requests.RequestException as e:
            logger.error(f"[PERSONAL] Sidecar connect check failed: {e}")
            return False

    def send_message(self, recipient: str, message: str) -> bool:
        if not self.connected or not self.org_id:
            raise Exception("Personal WhatsApp session is not connected")

        try:
            resp = requests.post(
                f"{WA_SIDECAR_URL}/session/{self.org_id}/send",
                headers=_sidecar_headers(),
                json={"to": recipient, "message": message},
                timeout=SIDECAR_TIMEOUT,
            )

            if resp.status_code == 200 and resp.json().get("success"):
                logger.info(f"[PERSONAL] Message sent to {recipient}")
                return True

            logger.error(f"[PERSONAL] Send failed ({resp.status_code}): {resp.text}")
            return False

        except requests.RequestException as e:
            logger.error(f"[PERSONAL] Send request error: {e}")
            raise

    def get_status(self) -> Dict[str, Any]:
        return {
            "mode": "personal",
            "connected": self.connected,
            "type": "real_browser",
            "org_id": self.org_id,
        }

    def disconnect(self) -> None:
        """
        Note: Celery worker calling disconnect() between messages should NOT
        destroy the session — the session must persist between tasks.
        We just mark the local state as disconnected.
        Full disconnect (clearing auth) must be triggered via the API endpoint.
        """
        self.connected = False
        logger.info(f"[PERSONAL] Provider marked disconnected for org {self.org_id}")


class MockPersonalWhatsAppProvider(BaseProvider):
    """
    Mock provider for automated testing and local development.
    Requires no sidecar or browser.
    """

    def __init__(self):
        self.connected = False
        self.org_id: Optional[str] = None

    def connect(self, credentials: Dict[str, Any]) -> bool:
        self.org_id = str(credentials.get("org_id", "mock"))
        self.connected = True
        logger.info(f"[MOCK-PERSONAL] Connected for org={self.org_id}")
        return True

    def send_message(self, recipient: str, message: str) -> bool:
        if not self.connected:
            raise Exception("MockPersonal: not connected")
        logger.info(f"[MOCK-PERSONAL] → {recipient}: {message[:60]}...")
        return True

    def get_status(self) -> Dict[str, Any]:
        return {"mode": "personal", "connected": self.connected, "type": "mock"}

    def disconnect(self) -> None:
        self.connected = False
        logger.info("[MOCK-PERSONAL] Disconnected")


# Keep the old name as an alias so existing imports don't break
PersonalWhatsAppProvider = RealPersonalWhatsAppProvider
