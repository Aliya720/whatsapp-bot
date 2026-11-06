# WhatsApp Bot — Complete Setup & Flow Guide

> **Last updated:** 2026-09-29  
> This document covers: architecture, local development setup, production deployment, and the complete connection flow for both Personal and Professional WhatsApp modes.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Service Descriptions](#2-service-descriptions)
3. [Environment Variables Reference](#3-environment-variables-reference)
4. [Local Development Setup](#4-local-development-setup)
5. [Production Deployment Setup](#5-production-deployment-setup)
6. [Personal WhatsApp Connection Flow](#6-personal-whatsapp-connection-flow)
7. [Professional WhatsApp Connection Flow](#7-professional-whatsapp-connection-flow)
8. [Campaign Execution Flow](#8-campaign-execution-flow)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User's Browser                                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │  HTTP :8080
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Nginx (Reverse Proxy)                              │
│   /api/*  ──────────────────────────────────────────►  FastAPI :8000        │
│   /*       ─────────────────────────────────────────►  Next.js :3000        │
└──────────────────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                    │
              ▼                ▼                    ▼
     ┌──────────────┐  ┌──────────────┐   ┌────────────────────────┐
     │  PostgreSQL   │  │    Redis      │   │   wa-sidecar (Node.js) │
     │  (data store) │  │  (Celery MQ)  │   │   whatsapp-web.js      │
     └──────────────┘  └──────────────┘   │   Real QR + Sessions   │
                               │           └────────────────────────┘
              ┌────────────────┤
              ▼                ▼
  ┌───────────────────┐  ┌─────────────────────────┐
  │  personal_worker  │  │  professional_worker     │
  │  (Celery, Q=1)    │  │  (Celery, Q=4)           │
  └───────────────────┘  └─────────────────────────┘
```

### Key design decisions

| Decision | Rationale |
|---|---|
| Node.js sidecar for WhatsApp | `whatsapp-web.js` requires a real Chrome/Chromium environment. Isolating it in a separate container keeps the Python backend lightweight and clearly separates concerns. |
| FastAPI backend is stateless w.r.t. WA sessions | All session state lives in the sidecar's memory + LocalAuth files. The backend just proxies; this means the backend can scale horizontally. |
| `USE_MOCK_PROVIDERS=true` default for dev | Lets developers run and test the full app without spinning up Chrome/Chromium. |
| Sessions on a named Docker volume | `wa_sessions` volume survives `docker compose down` (without `--volumes`), so users don't need to re-scan after deployments. |
| Shared `SIDECAR_API_KEY` | Prevents rogue callers from accessing the sidecar directly. Keep this secret. |

---

## 2. Service Descriptions

| Service | Image / Build | Port | Purpose |
|---|---|---|---|
| `db` | `postgres:15-alpine` | internal | Primary data store |
| `redis` | `redis:7-alpine` | internal | Celery broker + result backend |
| `wa-sidecar` | `./wa-sidecar` | internal :3001 | WhatsApp Web session manager (headless Chrome + whatsapp-web.js) |
| `backend` | `./backend` | internal :8000 | FastAPI REST API |
| `personal_worker` | `./backend` | — | Celery worker for personal-mode campaigns |
| `professional_worker` | `./backend` | — | Celery worker for professional-mode (Meta Cloud API) campaigns |
| `frontend` | `./frontend` | internal :3000 | Next.js frontend |
| `nginx` | `nginx:alpine` | **:8080** (dev) / **:80** (prod) | Reverse proxy routing /api/* to backend and /* to frontend |

---

## 3. Environment Variables Reference

Copy `.env.example` to `.env` and fill in all values before starting.

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_USER` | ✅ | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | ✅ | `postgres` | PostgreSQL password — **change in production** |
| `DB_NAME` | ✅ | `whatsapp_bot` | PostgreSQL database name |
| `ENVIRONMENT` | ✅ | `development` | `development` or `production` |
| `JWT_SECRET` | ✅ | *weak default* | JWT signing key — **generate a strong random value** |
| `SIDECAR_API_KEY` | ✅ | *weak default* | Shared secret between backend ↔ wa-sidecar |
| `USE_MOCK_PROVIDERS` | ✅ | `false` | `true` = no real WhatsApp (unit tests, pure dev); `false` = real |
| `HTTP_PORT` | ❌ | `8080` | Host port that Nginx listens on |
| `META_ACCESS_TOKEN_DEV` | ❌ | — | Meta Cloud API token for dev testing (production uses AWS Secrets Manager) |

### Generate secure secrets

```bash
# JWT_SECRET
python -c "import secrets; print(secrets.token_hex(32))"

# SIDECAR_API_KEY
python -c "import secrets; print(secrets.token_hex(24))"
```

---

## 4. Local Development Setup

### Prerequisites

- Docker Desktop (with Linux containers)
- Docker Compose v2
- Node.js ≥ 20 (only needed if running the sidecar outside Docker)
- Python 3.11 (only needed if running the backend outside Docker)

### Step 1 — Clone and configure

```bash
git clone <your-repo-url>
cd whatsapp-bot

cp .env.example .env
# Edit .env and at minimum set DB_PASSWORD and JWT_SECRET
```

### Step 2 — Start all services

```bash
docker compose up --build
```

This will:
1. Build all custom images (backend, frontend, wa-sidecar)
2. Start PostgreSQL and Redis
3. Start the wa-sidecar (Chromium boots inside the container — takes ~15–20s on first start)
4. Run database migrations
5. Start the FastAPI backend, Celery workers, and Next.js frontend
6. Start Nginx on port 8080

### Step 3 — Run database migrations

In a separate terminal (after services are healthy):

```bash
docker compose exec backend alembic upgrade head
```

### Step 4 — Access the app

| URL | Purpose |
|---|---|
| http://localhost:8080 | Main application |
| http://localhost:8080/api/docs | FastAPI Swagger UI |
| http://localhost:8080/api/health | Health check |

### Step 5 — Register and log in

1. Open http://localhost:8080/register
2. Create an account
3. Log in at http://localhost:8080/login

### Running without Docker (for faster iteration)

**Backend:**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
# Set env vars or create a .env in backend/
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

**wa-sidecar (requires Node ≥ 20 and system Chromium):**
```bash
cd wa-sidecar
npm install
WA_SIDECAR_URL=http://localhost:3001 SIDECAR_API_KEY=dev-key node index.js
```

> **Note for Windows local dev:** Puppeteer may need `PUPPETEER_EXECUTABLE_PATH` pointing to your Chrome installation. Running via Docker is recommended.

---

## 5. Production Deployment Setup

### Prerequisites

- A Linux VPS / cloud VM (Ubuntu 22.04+ recommended)
- Docker Engine + Docker Compose v2
- A domain name with DNS pointing to your server
- (Recommended) Nginx or Caddy at the host level for TLS termination

### Step 1 — Server setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y
```

### Step 2 — Clone and configure

```bash
git clone <your-repo-url> /opt/whatsapp-bot
cd /opt/whatsapp-bot

cp .env.example .env
nano .env   # Fill in ALL values with strong secrets
```

**Required production `.env` values:**

```dotenv
DB_PASSWORD=<strong random password>
ENVIRONMENT=production
JWT_SECRET=<64 char hex>
SIDECAR_API_KEY=<48 char hex>
USE_MOCK_PROVIDERS=false
HTTP_PORT=8080   # or 80 if no host-level proxy
```

### Step 3 — Deploy

```bash
docker compose up -d --build
```

### Step 4 — Run migrations

```bash
docker compose exec backend alembic upgrade head
```

### Step 5 — TLS / HTTPS (Recommended)

Use Caddy at the host level for automatic HTTPS:

```bash
sudo apt install caddy -y
```

`/etc/caddy/Caddyfile`:
```
yourdomain.com {
    reverse_proxy localhost:8080
}
```

```bash
sudo systemctl reload caddy
```

### Step 6 — Set `HTTP_PORT=8080` and update Nginx server_name

In `nginx/default.conf`, optionally set `server_name yourdomain.com;`

### Updating the deployment

```bash
cd /opt/whatsapp-bot
git pull
docker compose up -d --build --no-deps backend frontend wa-sidecar
docker compose exec backend alembic upgrade head
```

> WhatsApp sessions in `wa_sessions` volume are preserved across deployments. Users will **not** need to re-scan their QR code unless the `wa_sessions` volume is explicitly deleted.

---

## 6. Personal WhatsApp Connection Flow

This is the complete flow for a user connecting their personal WhatsApp account.

### 6.1 First-time connection

```
User clicks "Generate QR Code"
        │
        ▼
Frontend  POST /api/personal/connect
        │
        ▼  (Nginx proxies to FastAPI)
FastAPI   POST /session/{org_id}/connect  →  wa-sidecar
        │
        ▼  (wa-sidecar starts Puppeteer/Chromium)
wa-sidecar navigates to web.whatsapp.com
        │
        ▼  WhatsApp servers return a real QR token
wa-sidecar emits "qr" event  →  converts to PNG base64 data URI
        │
        ▼  (within ~5s)
FastAPI   returns { status: "qr_ready", qr: "data:image/png;base64,..." }
        │
        ▼
Frontend  displays the QR image to user
        │
User scans QR with WhatsApp app on their phone
        │
        ▼  WhatsApp authenticates the session
wa-sidecar receives "authenticated" event → saves session to /app/sessions/
wa-sidecar receives "ready" event        → status = "connected"
        │
        ▼  (frontend polls /api/personal/status every 2.5s)
Frontend  sees { connected: true, phone: "+91..." }
        │
        ▼
UI shows "WhatsApp Connected ✓"
```

### 6.2 QR refresh (user too slow to scan)

WhatsApp QR codes expire after **~20 seconds**.

```
wa-sidecar emits new "qr" event every ~20s if not yet authenticated
        │
Frontend polls GET /api/personal/qr every 18s
        │
FastAPI proxies to GET /session/{org_id}/qr
        │
Frontend updates the displayed QR image automatically
```

### 6.3 Session restoration after restart

When the backend/wa-sidecar container restarts:

```
wa-sidecar starts → Client.initialize() is called
        │
LocalAuth finds saved session in /app/sessions/.wwebjs_auth/session-{org_id}/
        │
        ▼  No QR needed!
wa-sidecar emits "authenticated" → "ready" directly
        │
FastAPI GET /api/personal/status returns { connected: true }
```

### 6.4 Disconnect

```
User clicks "Disconnect"
        │
Frontend  POST /api/personal/disconnect
        │
FastAPI   POST /session/{org_id}/disconnect  →  wa-sidecar
        │
wa-sidecar calls client.destroy() + deletes /app/sessions/.wwebjs_auth/session-{org_id}/
        │
Next connect will require a fresh QR scan
```

---

## 7. Professional WhatsApp Connection Flow

This mode uses the official Meta Cloud API. No browser session is needed.

### Setup steps

1. Create a Meta Developer App at https://developers.facebook.com
2. Add the "WhatsApp Business" product
3. Obtain: **Phone Number ID**, **Business Account ID**, **Permanent Access Token**
4. Go to **Settings → Professional WhatsApp API** in the app
5. Enter the credentials and save
6. Set the Meta App webhook URL to: `https://yourdomain.com/api/professional/webhook`
7. Use the same value as your **Webhook Verify Token** field

### Flow

```
User configures: Phone Number ID + Business Account ID + Access Token + Webhook Token
        │
FastAPI encrypts + stores Access Token in AWS Secrets Manager (or env var in dev)
FastAPI stores other config in PostgreSQL (organization_meta_configs table)
        │
Meta App  →  GET /api/professional/webhook?hub.mode=subscribe&hub.verify_token=...
FastAPI validates token → returns hub.challenge  → Meta App enabled ✓
        │
Campaign runs → professional_worker calls Meta Cloud API → sends messages
        │
Delivery receipts → Meta pushes to POST /api/professional/webhook
FastAPI processes status updates (delivered / read / failed)
```

---

## 8. Campaign Execution Flow

### Personal mode

```
User creates campaign (mode=personal) → assigns recipients
        │
User clicks "Launch"
        │
FastAPI queues: personal.process_campaign(campaign_id, org_id) → Redis
        │
personal_worker picks up task
        │
Worker calls RealPersonalWhatsAppProvider.connect(org_id)
  → GET /session/{org_id}/status  to wa-sidecar
  → If not connected → raises ConnectionError → Celery retries (3x with backoff)
  → If connected → proceed
        │
For each pending recipient (SELECT FOR UPDATE SKIP LOCKED):
  → Worker calls send_message(phone, personalized_message)
  → POST /session/{org_id}/send  to wa-sidecar
  → wa-sidecar calls client.sendMessage()
  → Records MessageLog in PostgreSQL
  → 8 second delay between messages (anti-spam)
        │
All recipients sent → campaign.status = COMPLETED
```

### Professional mode

```
User creates campaign (mode=professional) → assigns recipients
        │
User clicks "Launch"
        │
FastAPI queues: professional.process_campaign → Redis
        │
professional_worker picks up task
        │
For each pending recipient (SELECT FOR UPDATE SKIP LOCKED):
  → Calls Meta Cloud API POST /messages
  → Records MessageLog with wamid
  → Meta delivers → pushes webhook → delivery status updated
        │
All recipients processed → campaign.status = COMPLETED
```

---

## 9. Troubleshooting

### "WhatsApp sidecar service is unavailable"
- Check that the `wa-sidecar` container is running: `docker compose ps`
- Check its logs: `docker compose logs wa-sidecar`
- The sidecar needs `SIDECAR_API_KEY` to match the backend's `SIDECAR_API_KEY`

### QR code shows but WhatsApp says "invalid QR"
- This should no longer happen with the real sidecar. If it does:
  - Check `docker compose logs wa-sidecar` for Puppeteer/Chrome errors
  - Ensure the sidecar container has internet access
  - Try restarting: `docker compose restart wa-sidecar`

### Session keeps expiring / requiring re-scan
- The `wa_sessions` Docker volume must be present: `docker volume ls | grep wa_sessions`
- Do NOT run `docker compose down --volumes` unless you want to reset all data
- WhatsApp's own servers can invalidate sessions; this is expected occasionally

### Celery personal_worker fails with "Session not connected"
- The user must connect via the Settings page before launching a personal campaign
- The worker checks `/session/{org_id}/status` via the sidecar; if the session is not authenticated it retries up to 3 times with exponential backoff

### Database migrations not applied
```bash
docker compose exec backend alembic upgrade head
```

### Frontend 502 Bad Gateway
- Check that the backend is healthy: `docker compose ps backend`
- Check logs: `docker compose logs backend`

### wa-sidecar takes too long to start
The first start downloads Chromium data and WhatsApp Web assets — this can take 30–60s. Subsequent starts are faster because LocalAuth data is cached. Increase the healthcheck `start_period` if needed.

---

