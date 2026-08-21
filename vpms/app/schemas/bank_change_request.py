import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.validators import validate_ifsc
from app.models.enums import BankChangeStatus


class BankChangeCreate(BaseModel):
    new_account_no: str
    new_ifsc_code: str

    @field_validator("new_ifsc_code")
    @classmethod
    def _check_ifsc(cls, v: str) -> str:
        return validate_ifsc(v.upper())


class BankChangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vendor_id: uuid.UUID
    new_account_no: str
    new_ifsc_code: str
    status: BankChangeStatus
    requested_by: uuid.UUID
    first_approved_by: uuid.UUID | None
    second_approved_by: uuid.UUID | None
    rejection_reason: str | None
    created_at: datetime


class BankChangeRejectRequest(BaseModel):
    rejection_reason: str
