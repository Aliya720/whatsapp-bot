from pydantic import BaseModel, EmailStr
from uuid import UUID

class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    company_name: str

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    org_id: UUID

    class Config:
        from_attributes = True

class PasswordReset(BaseModel):
    old_password: str
    new_password: str
