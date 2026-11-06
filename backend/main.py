import uuid
import time
from fastapi import FastAPI, Request
import redis.asyncio as redis
from fastapi_limiter import FastAPILimiter
from api import health, auth, recipients, templates, campaigns, personal, professional, dashboard, reports
from core.config import settings

app = FastAPI(title="WhatsApp Bot API")

@app.on_event("startup")
async def startup():
    redis_conn = redis.from_url(settings.REDIS_URL, encoding="utf8", decode_responses=True)
    await FastAPILimiter.init(redis_conn)

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    response.headers["X-Request-ID"] = request_id
    return response

app.include_router(health.router, tags=["Health"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(recipients.router, prefix="/recipients", tags=["Recipients"])
app.include_router(templates.router, prefix="/templates", tags=["Templates"])
app.include_router(campaigns.router, prefix="/campaigns", tags=["Campaigns"])
app.include_router(personal.router, prefix="/personal", tags=["Personal"])
app.include_router(professional.router, prefix="/professional", tags=["Professional"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
app.include_router(reports.router, prefix="/reports", tags=["Reports"])
