import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "WhatsApp Bot API"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/whatsapp_bot")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    class Config:
        case_sensitive = True

settings = Settings()
