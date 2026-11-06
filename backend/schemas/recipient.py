from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID

class RecipientBase(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: str = Field(..., description="E.164 formatted phone number")
    company: Optional[str] = None
    custom_data: Dict[str, Any] = Field(default_factory=dict)

class RecipientCreate(RecipientBase):
    """
    Schema for explicitly creating a recipient (API/Manual).
    """
    pass

class RecipientResponse(RecipientBase):
    id: UUID
    org_id: UUID

    model_config = ConfigDict(from_attributes=True)

class ImportRow(BaseModel):
    """
    Used for previewing rows.
    """
    row_index: int
    data: Dict[str, Any]

class ImportPreview(BaseModel):
    """
    Result of a file upload and parse.
    """
    file_id: str
    total_rows: int
    detected_columns: List[str]
    preview_rows: List[ImportRow]

class ColumnMapping(BaseModel):
    phone_number: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    custom_fields: Dict[str, str] = Field(default_factory=dict)

class ImportValidateRequest(BaseModel):
    file_id: str
    mapping: ColumnMapping
    default_region: str = "IN"
    duplicate_action: str = "skip"  # "skip", "update", or "error"

class ValidatedRow(BaseModel):
    row_index: int
    recipient: Optional[RecipientCreate] = None
    is_duplicate: bool = False
    errors: List[str] = Field(default_factory=list)

class ImportValidationResult(BaseModel):
    file_id: str
    total_rows: int
    valid_count: int
    invalid_count: int
    duplicate_count: int
    rows: List[ValidatedRow]

class ImportConfirmRequest(BaseModel):
    file_id: str
    duplicate_action: Optional[str] = "skip"  # "skip" or "update"

