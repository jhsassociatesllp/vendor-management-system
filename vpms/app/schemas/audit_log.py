import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import AuditAction


class FieldChange(BaseModel):
    field: str
    old_value: str | None
    new_value: str | None


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sequence: int
    timestamp: datetime
    user_id: uuid.UUID | None
    user_name_snapshot: str | None
    role_snapshot: str | None
    ip_address: str | None
    action: AuditAction
    module: str
    record_reference: str
    field_changes: list[FieldChange] | None
    session_id: str | None
    previous_hash: str
    record_hash: str


class IntegrityCheckBreak(BaseModel):
    id: uuid.UUID
    sequence: int
    expected_hash: str
    stored_hash: str


class IntegrityCheckResult(BaseModel):
    rows_checked: int
    clean: bool
    breaks: list[IntegrityCheckBreak]
