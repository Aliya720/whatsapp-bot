from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import verify_password, get_password_hash, create_access_token, create_refresh_token
from core.config import settings
from models.user import User
from models.organization import Organization
from schemas.auth import Token, UserCreate, UserResponse, PasswordReset
from .deps import get_current_user
from jose import jwt, JWTError
from fastapi_limiter.depends import RateLimiter

router = APIRouter()

@router.post("/register", response_model=UserResponse, dependencies=[Depends(RateLimiter(times=5, minutes=1))])
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Registers a new user and creates an organization.
    """
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system",
        )
    
    org = Organization(name=user_in.company_name)
    db.add(org)
    db.commit()
    db.refresh(org)

    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        org_id=org.id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token, dependencies=[Depends(RateLimiter(times=10, minutes=1))])
def login(
    response: Response, 
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    """
    Authenticates user. Returns access token via JSON and refresh token via HttpOnly cookie.
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    
    # Set HTTP-only cookie for refresh token to prevent XSS exfiltration
    response.set_cookie(
        key="refresh_token", 
        value=refresh_token, 
        httponly=True, 
        secure=settings.ENVIRONMENT == "production", 
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )

    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/refresh", response_model=Token)
def refresh_token(request: Request, db: Session = Depends(get_db)):
    """
    Rotates access token using the refresh token cookie.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token provided")
        
    try:
        payload = jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if payload.get("type") != "refresh" or not user_id:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
        
    access_token = create_access_token(user.id)
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
def logout(response: Response):
    """
    Clears the HttpOnly refresh token cookie.
    """
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Returns the currently authenticated user's profile.
    """
    return current_user

@router.post("/reset-password")
def reset_password(
    payload: PasswordReset,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Allows an authenticated user to change their password.
    """
    if not verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid old password")
        
    current_user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}
