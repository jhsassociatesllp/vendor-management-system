import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentMode, PaymentStatus


class PaymentCreate(BaseModel):
    invoice_id: uuid.UUID
    tds_section: str | None = None
    tds_rate: Decimal | None = Field(default=None, ge=0)
    tds_override_reason: str | None = None
    payment_mode: PaymentMode
    company_bank_account: str = Field(min_length=1)
    payment_date: date
    utr_reference: str = Field(min_length=1)
    itc_eligible: bool


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID
    gross_amount: Decimal
    tds_section: str
    tds_rate: Decimal
    tds_amount: Decimal
    net_payable_amount: Decimal
    payment_mode: PaymentMode
    company_bank_account: str
    payment_date: date
    utr_reference: str
    itc_eligible: bool
    status: PaymentStatus
    initiated_by: uuid.UUID
    initiated_at: datetime
    confirmed_by: uuid.UUID | None
    confirmed_at: datetime | None
    rejection_reason: str | None
    late_payment_interest_amount: Decimal
    is_late: bool
    created_at: datetime


class PaymentRejectRequest(BaseModel):
    reason: str = Field(min_length=1)


class TdsDefaultRead(BaseModel):
    tds_section: str
    tds_rate: Decimal


class MsmeAlertRead(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str
    vendor_id: uuid.UUID
    payment_due_date: date
    alert_type: str
    days_until_due: int
