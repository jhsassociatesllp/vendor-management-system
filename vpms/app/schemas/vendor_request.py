import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.core.validators import validate_gstin, validate_pan
from app.models.enums import VendorRequestStatus


class VendorRequestCreate(BaseModel):
    business_need: str
    category: str
    estimated_annual_spend: Decimal
    recommended_vendor_name: str
    recommended_pan: str
    recommended_gstin: str | None = None

    financial_stability_ok: bool
    technical_capability_ok: bool
    compliance_status_ok: bool
    blacklist_check_ok: bool
    conflict_of_interest_declared: bool
    references_provided: bool = False

    msme_udyam_number: str | None = None

    @field_validator("recommended_pan")
    @classmethod
    def _check_pan(cls, v: str) -> str:
        return validate_pan(v)

    @field_validator("recommended_gstin")
    @classmethod
    def _check_gstin(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_gstin(v)


class VendorRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requested_by: uuid.UUID
    business_need: str
    category: str
    estimated_annual_spend: Decimal
    recommended_vendor_name: str
    recommended_pan: str
    recommended_gstin: str | None
    financial_stability_ok: bool
    technical_capability_ok: bool
    compliance_status_ok: bool
    blacklist_check_ok: bool
    conflict_of_interest_declared: bool
    references_provided: bool
    msme_udyam_number: str | None
    status: VendorRequestStatus
    rejection_reason: str | None
    accounts_reviewed_by: uuid.UUID | None
    accounts_reviewed_at: datetime | None
    partner_decided_by: uuid.UUID | None
    partner_decided_at: datetime | None
    created_at: datetime


class AccountsReviewAction(BaseModel):
    action: str  # "advance" | "reject"
    rejection_reason: str | None = None

    @model_validator(mode="after")
    def _check_reason(self):
        if self.action not in ("advance", "reject"):
            raise ValueError("action must be 'advance' or 'reject'")
        if self.action == "reject" and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting")
        return self


class PartnerDecisionAction(BaseModel):
    action: str  # "approve" | "reject"
    rejection_reason: str | None = None

    @model_validator(mode="after")
    def _check_reason(self):
        if self.action not in ("approve", "reject"):
            raise ValueError("action must be 'approve' or 'reject'")
        if self.action == "reject" and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting")
        return self
