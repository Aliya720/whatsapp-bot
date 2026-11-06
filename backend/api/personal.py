"""
api/personal.py

Personal WhatsApp Connection API
──────────────────────────────────
Routes that proxy connection management requests to the Node.js wa-sidecar service.

The sidecar manages the actual headless browser session (whatsapp-web.js) and
owns all session state. The Python backend is intentionally stateless with respect
to WhatsApp sessions — it just forwards requests and returns the sidecar's response.

Endpoints:
  GET  /personal/status   - Returns connection status for the authenticated org
  POST /personal/connect  - Initiates session; returns QR code or connected status
  POST /personal/disconnect - Destroys the session and clears saved auth data
  GET  /personal/qr       - Polls for a fresh QR code (called by the frontend during scan)
"""

import os
import logging
import requests
from fastapi import APIRouter, Depends, HTTPException 

from core.database import get_db
from models.user import User
from api.deps import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

WA_SIDECAR_URL = os.getenv("WA_SIDECAR_URL", "http://wa-sidecar:3001")
SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "change-me-in-production")
SIDECAR_TIMEOUT = int(os.getenv("WA_SIDECAR_TIMEOUT", "20"))


def _headers():
    return {"X-Api-Key": SIDECAR_API_KEY}


def _sidecar_request(method: str, path: str, **kwargs):
    """
    Helper that wraps requests to the wa-sidecar and converts connection errors
    into clean HTTP 503 responses.
    """
    url = f"{WA_SIDECAR_URL}{path}"
    try:
        resp = requests.request(
            method,
            url,
            headers=_headers(),
            timeout=SIDECAR_TIMEOUT,
            **kwargs,
        )
        return resp
    except requests.exceptions.ConnectionError:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp sidecar service is unavailable. Please check that the wa-sidecar container is running."
        )
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="WhatsApp sidecar timed out. The QR code may still be loading."
        )


@router.get("/status")
def get_status(current_user: User = Depends(get_current_user)):
    """
    Returns the current WhatsApp connection status for the user's organization.
    """
    org_id = str(current_user.org_id)
    resp = _sidecar_request("GET", f"/session/{org_id}/status")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Unexpected response from sidecar")

    data = resp.json()
    return {
        "connected": data.get("connected", False),
        "status": data.get("status", "disconnected"),
        "phone": data.get("phone"),
        "qr": data.get("qr"),
        "mode": "personal",
    }


@router.post("/connect")
def connect_whatsapp(current_user: User = Depends(get_current_user)):
    """
    Initiates (or resumes) a WhatsApp Web session for the org.

    Response:
      { status: "connected", phone: "+91..." }         — already connected / restored from saved session
      { status: "qr_ready", qr: "data:image/png;..." } — new QR code to scan
      { status: "initializing" }                        — session starting, poll /status
    """
    org_id = str(current_user.org_id)
    resp = _sidecar_request("POST", f"/session/{org_id}/connect")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Sidecar error: {resp.text}")

    return resp.json()


@router.get("/qr")
def get_qr(current_user: User = Depends(get_current_user)):
    """
    Polls for the latest QR code. The frontend calls this every ~18s to refresh
    the displayed QR while the user has not yet scanned.

    Returns 404 if no QR is currently available (session already connected or
    not yet initialized).
    """
    org_id = str(current_user.org_id)
    resp = _sidecar_request("GET", f"/session/{org_id}/qr")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="No QR code available")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Sidecar error: {resp.text}")

    return resp.json()


@router.post("/disconnect")
def disconnect_whatsapp(current_user: User = Depends(get_current_user)):
    """
    Destroys the WhatsApp session and removes all saved authentication data.
    The next /connect call will require a fresh QR scan.
    """
    org_id = str(current_user.org_id)
    resp = _sidecar_request("POST", f"/session/{org_id}/disconnect")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Sidecar error: {resp.text}")

    return {"status": "disconnected"}
