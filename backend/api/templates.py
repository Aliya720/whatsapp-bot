from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.database import get_db
from models.user import User
from models.template import Template
from schemas.template import TemplateCreate, TemplateResponse
from api.deps import get_current_user

router = APIRouter()

@router.post("/", response_model=TemplateResponse)
def create_template(
    template: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exists = db.query(Template).filter(
        Template.org_id == current_user.org_id,
        Template.name == template.name
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Template with this name already exists")
    
    db_template = Template(
        org_id=current_user.org_id,
        created_by=current_user.id,
        name=template.name,
        content=template.content
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

@router.get("/", response_model=List[TemplateResponse])
def list_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(Template).filter(Template.org_id == current_user.org_id).order_by(Template.created_at.desc()).all()

@router.delete("/{template_id}")
def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    template = db.query(Template).filter(
        Template.id == template_id,
        Template.org_id == current_user.org_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    db.delete(template)
    db.commit()
    return {"message": "Template deleted"}
