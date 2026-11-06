from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.database import get_db

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "healthy"}

@router.get("/ready")
async def readiness_check(db: Session = Depends(get_db)):
    try:
        # Check DB connection
        db.execute(text("SELECT 1"))
        
        # Check Redis connection
        import redis.asyncio as redis
        from core.config import settings
        r = redis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.close()
        
        return {"status": "ready", "database": "connected", "redis": "connected"}
    except Exception as e:
        return {"status": "not ready", "error": str(e)}
