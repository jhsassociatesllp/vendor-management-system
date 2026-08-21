import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import InvoiceStatus


class InvoiceCreate(BaseModel):
    invoice_number: str = Field(min_length=1)
    po_id: uuid.UUID | None = None
    agreement_id: uuid.UUID
    item_code_id: uuid.UUID
    invoice_date: date
    quantity: Decimal = Field(gt=0)
    rate: Decimal = Field(gt=0)
    cgst_amount: Decimal = Field(ge=0)
    sgst_amount: Decimal = Field(ge=0)
    igst_amount: Decimal = Field(ge=0)
    total_invoice_amount: Decimal = Field(gt=0)
    period_service_from: date
    period_service_to: date
    billing_milestone_id: uuid.UUID | None = None
    work_description: str = Field(min_length=1)

    @model_validator(mode="after")
    def _check_period(self):
        if self.period_service_to < self.period_service_from:
            raise ValueError("period_service_to must be on or after period_service_from")
        return self


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_number: str
    vendor_id: uuid.UUID
    po_id: uuid.UUID | None
    agreement_id: uuid.UUID
    item_code_id: uuid.UUID
    invoice_date: date
    quantity: Decimal
    rate: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_gst_amount: Decimal
    total_invoice_amount: Decimal
    period_service_from: date
    period_service_to: date
    billing_milestone_id: uuid.UUID | None
    work_description: str
    rate_variance_flag: bool
    gst_mismatch_delta: Decimal
    msme_alert_triggered: bool
    status: InvoiceStatus
    payment_due_date: date | None
    created_at: datetime


class PurchaseOrderBalanceRead(BaseModel):
    po_id: uuid.UUID
    total_po_value_incl_gst: Decimal
    invoiced_amount: Decimal
    remaining_value: Decimal
    po_quantity: Decimal
    grn_confirmed_quantity: Decimal
    invoiced_quantity: Decimal
    remaining_quantity: Decimal
