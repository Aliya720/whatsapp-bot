# WhatsApp Bot SaaS

A multi-tenant, dual-mode WhatsApp Campaign Automation Platform designed for both small local businesses (Personal Mode via local web automation) and enterprise users (Professional Mode via Meta Cloud API).

## Project Overview

This SaaS platform provides an isolated, highly scalable environment where organizations can schedule and send personalized WhatsApp campaigns. 

**Dual Mode Architecture:**
1. **Personal Mode:** Operates using a local instance of WhatsApp Web via Playwright/Puppeteer automation. This mode does not rely on AWS or official Meta API approvals, running purely as a local worker. It uses a queue architecture but assumes execution on the user's local machine.
2. **Professional Mode:** Uses the official Meta WhatsApp Business Cloud API. Fully independent, scalable, and deployable to AWS via ECS/Fargate. Uses high-throughput webhook processing for message status updates.

## Architecture

- **Frontend:** Next.js 14, React, Tailwind CSS, TypeScript (deployed as a Node standalone container or static export).
- **Backend:** FastAPI (Python 3.11), SQLAlchemy 2.0, Celery.
- **Database:** PostgreSQL (transactional safety with `SELECT FOR UPDATE SKIP LOCKED` for worker concurrency).
- **Cache/Queue:** Redis (used by Celery).
- **Proxy:** Nginx (reverse proxy routing `/api/` to backend and `/` to frontend).

### Mode Isolation
Personal and Professional modes share the same `Campaign` database models but diverge strictly at the execution boundary:
- Separate Celery queues (`personal_messages` vs `professional_messages`).
- Separate Celery workers (`tasks/personal.py` vs `tasks/professional.py`).
- Separate Providers (`providers/personal/provider.py` vs `providers/professional/provider.py`).

## Security

- **Authentication:** JWT with HttpOnly Refresh tokens.
- **Authorization:** Multi-tenant DB layer. Every query is filtered by `org_id == current_user.org_id`.
- **Secrets Management:** Ready for AWS Secrets Manager. Tokens are never sent to the frontend or logged.
- **Idempotency:** Webhook processing uses strict SHA-256 payload hashing and DB uniqueness constraints to prevent duplicate processing. Celery tasks use database-level locking to prevent duplicate message sends during concurrent worker restarts.

## Local Development & Docker

```bash
# Start all services (Postgres, Redis, Backend, Frontend, Workers, Nginx)
docker compose up --build
```
Access the application at `http://localhost:8080`.

## AWS Architecture
Professional Mode is AWS-ready:
1. **ALB / CloudFront:** Traffic routing.
2. **ECS Fargate:** Hosts the FastAPI backend and Celery workers.
3. **Amazon RDS:** Managed PostgreSQL.
4. **Amazon ElastiCache:** Managed Redis.
5. **AWS Secrets Manager:** Secure storage for Meta API tokens.

*Note: Personal Mode requires a local machine or a Windows/Linux VM where the user can scan the WhatsApp Web QR code. It cannot be fully hosted as a background AWS lambda function without active session persistence.*

## Documentation Reference
Full engineering decisions and phase documentation can be found in `/project_documents/whatsapp_bot/`.

## Known Limitations
- Personal Mode relies on DOM automation which can break when WhatsApp Web updates. Use Professional Mode for critical enterprise delivery.
- File uploads for templates are currently restricted to `.csv` and `.xlsx` for recipients. Rich media templates (images/video) require further implementation in the Meta API provider.
