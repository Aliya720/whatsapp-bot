from typing import Optional
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

class TemplateBase(BaseModel):
    name: str
    content: str

class TemplateCreate(TemplateBase):
    pass

class TemplateResponse(TemplateBase):
    id: UUID
    org_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
