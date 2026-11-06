import uuid
import csv
import io
import json
import redis.asyncio as redis
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy.orm import Session
import sqlalchemy as sa
import openpyxl

from core.database import get_db
from core.config import settings
from api.deps import get_current_user
from models.user import User
from models.recipient import Recipient
from schemas.recipient import (
    RecipientResponse, RecipientCreate, ImportPreview, ImportRow, 
    ImportValidateRequest, ImportValidationResult, ValidatedRow, ImportConfirmRequest
)
from services.phone import normalize_phone, PhoneNormalizationError

router = APIRouter()

async def get_redis():
    return redis.from_url(settings.REDIS_URL, encoding="utf8", decode_responses=True)

@router.post("/import/upload", response_model=ImportPreview)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    Step 1: Upload and parse spreadsheet. Returns a preview and detected columns.
    Stores raw parsed data in Redis temporarily.
    """
    # Validate extension and size
    ext = file.filename.split('.')[-1].lower()
    if ext not in ['csv', 'xls', 'xlsx']:
        raise HTTPException(status_code=400, detail="Invalid file type. Only CSV, XLS, and XLSX are supported.")
    
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB.")

    headers = []
    rows = []

    try:
        if ext == 'csv':
            try:
                text = content.decode('utf-8-sig')
            except UnicodeDecodeError:
                text = content.decode('latin-1', errors='replace')

            # Sniff delimiter
            sample = text[:2048]
            delimiter = ','
            try:
                sniffer = csv.Sniffer()
                dialect = sniffer.sniff(sample)
                delimiter = dialect.delimiter
            except Exception:
                delimiter = ','

            reader = csv.reader(io.StringIO(text), delimiter=delimiter)
            raw_headers = next(reader, [])
            headers = [h.strip() for h in raw_headers if h and h.strip()]
            for row in reader:
                if any(isinstance(cell, str) and cell.strip() for cell in row):
                    rows.append([cell.strip() if isinstance(cell, str) else str(cell) for cell in row])
        elif ext == 'xlsx' or ext == 'xls':
            try:
                wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            except Exception as e:
                if ext == 'xls':
                    raise HTTPException(status_code=400, detail="Legacy binary .xls format is not supported. Please save or export your file as .xlsx or .csv.")
                raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

            sheet = wb.active
            for i, row in enumerate(sheet.iter_rows(values_only=True)):
                if i == 0:
                    headers = [str(cell).strip() if cell else f"Column_{j}" for j, cell in enumerate(row)]
                    headers = [h for h in headers if h]
                else:
                    if any(cell is not None and str(cell).strip() for cell in row):
                        cleaned_row = []
                        for cell in row:
                            if cell is None:
                                cleaned_row.append("")
                            elif isinstance(cell, float) and cell.is_integer():
                                cleaned_row.append(str(int(cell)))
                            else:
                                cleaned_row.append(str(cell).strip())
                        rows.append(cleaned_row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    if not headers:
        raise HTTPException(status_code=400, detail="File is empty or missing headers.")

    if len(rows) > 50000:
        raise HTTPException(status_code=400, detail="Row limit exceeded. Maximum 50,000 rows allowed.")

    # Convert to dict format
    dict_rows = []
    for r in rows:
        # pad row if shorter than headers
        padded_r = r + [""] * (len(headers) - len(r))
        dict_rows.append(dict(zip(headers, padded_r)))

    file_id = str(uuid.uuid4())
    
    # Store in Redis (1 hour TTL)
    await redis_client.setex(
        f"import:{file_id}:data", 
        3600, 
        json.dumps(dict_rows)
    )

    # Generate preview (first 5 rows)
    preview = [ImportRow(row_index=i, data=r) for i, r in enumerate(dict_rows[:5])]

    return ImportPreview(
        file_id=file_id,
        total_rows=len(dict_rows),
        detected_columns=headers,
        preview_rows=preview
    )

@router.post("/import/validate", response_model=ImportValidationResult)
async def validate_import(
    req: ImportValidateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    Step 2: Applies column mapping, normalizes phones, checks for duplicates.
    Stores validation results in Redis.
    """
    data_str = await redis_client.get(f"import:{req.file_id}:data")
    if not data_str:
        raise HTTPException(status_code=404, detail="Import session expired or not found.")
    
    dict_rows = json.loads(data_str)
    
    validated_rows = []
    valid_count = 0
    invalid_count = 0
    duplicate_count = 0

    # Fetch existing phone numbers for this org to detect duplicates
    existing_phones = {
        r[0] for r in db.query(Recipient.phone_number).filter(Recipient.org_id == current_user.org_id).all()
    }
    seen_in_file = set()

    duplicate_action = req.duplicate_action or "skip"

    for i, row in enumerate(dict_rows):
        errors = []
        recipient = None
        is_dup = False

        # Extract mapped fields
        raw_phone = row.get(req.mapping.phone_number, "")
        if not raw_phone:
            errors.append("Phone number is required.")
        else:
            try:
                phone = normalize_phone(raw_phone, req.default_region)
                
                # Check duplicates in DB
                if phone in existing_phones:
                    is_dup = True
                    duplicate_count += 1
                    if duplicate_action == "error":
                        errors.append("Phone number already exists in organization.")
                    elif duplicate_action == "skip":
                        # Not a fatal error, but marked duplicate
                        errors.append("Already in contacts (will be skipped).")
                elif phone in seen_in_file:
                    is_dup = True
                    duplicate_count += 1
                    errors.append("Duplicate phone number in file (will be skipped).")
                else:
                    seen_in_file.add(phone)

                # Build recipient if no fatal errors
                fatal_errors = [e for e in errors if "will be skipped" not in e]
                if not fatal_errors or duplicate_action == "update":
                    custom_data = {}
                    for custom_key, col_name in req.mapping.custom_fields.items():
                        custom_data[custom_key] = row.get(col_name, "")
                    
                    if len(json.dumps(custom_data)) > 2048:
                        errors.append("Custom data exceeds size limit (2KB).")
                    else:
                        recipient = RecipientCreate(
                            phone_number=phone,
                            first_name=row.get(req.mapping.first_name, "").strip() if req.mapping.first_name and row.get(req.mapping.first_name) else None,
                            last_name=row.get(req.mapping.last_name, "").strip() if req.mapping.last_name and row.get(req.mapping.last_name) else None,
                            company=row.get(req.mapping.company, "").strip() if req.mapping.company and row.get(req.mapping.company) else None,
                            custom_data=custom_data
                        )
            except PhoneNormalizationError as e:
                errors.append(str(e))
        
        # Categorize
        if errors:
            has_fatal = any("will be skipped" not in e for e in errors)
            if has_fatal and not (is_dup and duplicate_action == "update"):
                invalid_count += 1
            elif is_dup and duplicate_action == "update":
                valid_count += 1
        else:
            valid_count += 1

        validated_rows.append(ValidatedRow(
            row_index=i,
            recipient=recipient,
            is_duplicate=is_dup,
            errors=errors
        ))

    # Store validated rows and duplicate_action to redis
    await redis_client.setex(
        f"import:{req.file_id}:validated",
        3600,
        json.dumps([r.model_dump() for r in validated_rows])
    )
    await redis_client.setex(
        f"import:{req.file_id}:dup_action",
        3600,
        duplicate_action
    )

    return ImportValidationResult(
        file_id=req.file_id,
        total_rows=len(dict_rows),
        valid_count=valid_count,
        invalid_count=invalid_count,
        duplicate_count=duplicate_count,
        rows=validated_rows
    )

@router.post("/import/confirm")
async def confirm_import(
    req: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """
    Step 3: Persists the valid rows to the database.
    Supports inserting new contacts and updating existing contacts.
    """
    val_str = await redis_client.get(f"import:{req.file_id}:validated")
    if not val_str:
        raise HTTPException(status_code=404, detail="Validation session expired or not found. Please upload again.")

    saved_dup_action = await redis_client.get(f"import:{req.file_id}:dup_action")
    duplicate_action = req.duplicate_action or saved_dup_action or "skip"

    validated_rows = json.loads(val_str)
    
    # Query existing recipients for this org by phone
    existing_recipients = {
        r.phone_number: r for r in db.query(Recipient).filter(Recipient.org_id == current_user.org_id).all()
    }

    inserted_count = 0
    updated_count = 0
    skipped_count = 0
    objects_to_insert = []
    
    for r in validated_rows:
        recip_data = r.get('recipient')
        if not recip_data:
            continue
        
        errors = r.get('errors', [])
        # Check if row has hard invalid errors
        hard_errors = [e for e in errors if "will be skipped" not in e and "already exists" not in e]
        if hard_errors:
            continue

        phone = recip_data['phone_number']

        if phone in existing_recipients:
            if duplicate_action == "update":
                existing = existing_recipients[phone]
                if isinstance(existing, Recipient):
                    if recip_data.get('first_name') is not None:
                        existing.first_name = recip_data['first_name']
                    if recip_data.get('last_name') is not None:
                        existing.last_name = recip_data['last_name']
                    if recip_data.get('company') is not None:
                        existing.company = recip_data['company']
                    if recip_data.get('custom_data'):
                        cd = dict(existing.custom_data or {})
                        cd.update(recip_data['custom_data'])
                        existing.custom_data = cd
                    updated_count += 1
            else:
                skipped_count += 1
        else:
            objects_to_insert.append(
                Recipient(
                    id=uuid.uuid4(),
                    org_id=current_user.org_id,
                    phone_number=phone,
                    first_name=recip_data.get('first_name'),
                    last_name=recip_data.get('last_name'),
                    company=recip_data.get('company'),
                    custom_data=recip_data.get('custom_data', {})
                )
            )
            existing_recipients[phone] = True
            inserted_count += 1

    if objects_to_insert:
        db.bulk_save_objects(objects_to_insert)
    
    db.commit()

    # Clean up redis
    await redis_client.delete(
        f"import:{req.file_id}:data", 
        f"import:{req.file_id}:validated",
        f"import:{req.file_id}:dup_action"
    )

    return {
        "message": "Success", 
        "imported": inserted_count,
        "updated": updated_count,
        "skipped": skipped_count
    }

@router.post("/", response_model=RecipientResponse)
def create_recipient(
    recipient: RecipientCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually create a single recipient.
    """
    try:
        phone = normalize_phone(recipient.phone_number)
    except PhoneNormalizationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check duplicate
    exists = db.query(Recipient).filter(
        Recipient.org_id == current_user.org_id,
        Recipient.phone_number == phone
    ).first()
    
    if exists:
        raise HTTPException(status_code=400, detail="Phone number already exists in organization.")
    
    if len(json.dumps(recipient.custom_data)) > 2048:
        raise HTTPException(status_code=400, detail="Custom data exceeds size limit (2KB).")

    db_recipient = Recipient(
        org_id=current_user.org_id,
        phone_number=phone,
        first_name=recipient.first_name,
        last_name=recipient.last_name,
        company=recipient.company,
        custom_data=recipient.custom_data
    )
    db.add(db_recipient)
    db.commit()
    db.refresh(db_recipient)
    return db_recipient

@router.get("/", response_model=List[RecipientResponse])
def list_recipients(
    skip: int = 0, limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List recipients for the current organization, newest first.
    """
    return db.query(Recipient).filter(
        Recipient.org_id == current_user.org_id
    ).order_by(Recipient.created_at.desc()).offset(skip).limit(limit).all()

