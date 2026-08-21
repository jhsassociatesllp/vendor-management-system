import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import AgreementStatus, BillingFrequency, PORequirement


class AgreementCreate(BaseModel):
    vendor_id: uuid.UUID
    scope_of_work: str
    supporting_document_url: str
    billing_frequency: BillingFrequency
    agreement_start_date: date
    agreement_end_date: date
    auto_renewal_flag: bool = False
    po_requirement: PORequirement
    credit_period_days: int
    tds_section: str | None = None
    tds_override_reason: str | None = None
    gst_rate: Decimal
    reverse_charge_flag: bool = False
    approved_by_designation: str
    item_code_ids: list[uuid.UUID] = Field(min_length=1)

    @model_validator(mode="after")
    def _check_dates(self):
        if self.agreement_end_date < self.agreement_start_date:
            raise ValueError("agreement_end_date must be on or after agreement_start_date")
        return self


class AgreementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_number: str
    vendor_id: uuid.UUID
    scope_of_work: str
    supporting_document_url: str
    billing_frequency: BillingFrequency
    agreement_start_date: date
    agreement_end_date: date
    auto_renewal_flag: bool
    po_requirement: PORequirement
    credit_period_days: int
    tds_section: str
    tds_override_reason: str | None
    gst_rate: Decimal
    reverse_charge_flag: bool
    approved_by_designation: str
    status: AgreementStatus
    created_at: datetime
    covered_item_code_ids: list[uuid.UUID] = []
