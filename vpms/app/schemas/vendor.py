import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

from app.core.validators import validate_gstin, validate_ifsc, validate_mobile, validate_pan
from app.models.enums import VendorCategory


class VendorCreate(BaseModel):
    vendor_category: VendorCategory
    tds_section_override: str | None = None
    tds_section_override_reason: str | None = None

    msme_status: bool = False
    udyam_number: str | None = None

    bank_account_no: str
    ifsc_code: str
    cancelled_cheque_doc_url: str

    address: str
    email: EmailStr
    mobile_number: str

    @field_validator("ifsc_code")
    @classmethod
    def _check_ifsc(cls, v: str) -> str:
        return validate_ifsc(v.upper())

    @field_validator("mobile_number")
    @classmethod
    def _check_mobile(cls, v: str) -> str:
        return validate_mobile(v)

    @model_validator(mode="after")
    def _check_business_rules(self):
        if self.msme_status and not self.udyam_number:
            raise ValueError("udyam_number is required when msme_status is true")
        if self.tds_section_override and not self.tds_section_override_reason:
            raise ValueError("tds_section_override_reason is required when overriding tds_section")
        return self


class VendorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vendor_code: str
    source_request_id: uuid.UUID
    vendor_name: str
    pan: str
    gstin: str | None
    msme_status: bool
    udyam_number: str | None
    vendor_category: VendorCategory
    tds_section: str
    tds_section_overridden: bool
    tds_section_override_reason: str | None
    bank_account_no: str
    ifsc_code: str
    bank_name: str
    bank_branch: str
    cancelled_cheque_doc_url: str
    address: str
    email: str
    mobile_number: str
    is_active: bool
    created_at: datetime


class VendorItemCodeLinkCreate(BaseModel):
    item_code_ids: list[uuid.UUID]


class VendorItemCodeLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vendor_id: uuid.UUID
    item_code_id: uuid.UUID
    is_active: bool
