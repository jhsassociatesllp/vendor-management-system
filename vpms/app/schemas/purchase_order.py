import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PurchaseOrderStatus


class PurchaseOrderCreate(BaseModel):
    vendor_id: uuid.UUID
    item_code_id: uuid.UUID
    agreement_id: uuid.UUID
    description: str
    quantity: Decimal = Field(gt=0)
    rate: Decimal | None = Field(default=None, gt=0)
    rate_override_reason: str | None = None
    budget_head_id: uuid.UUID
    delivery_completion_date: date
    po_validity_date: date
    over_budget_justification: str | None = None


class PurchaseOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    po_number: str
    version: int
    vendor_id: uuid.UUID
    item_code_id: uuid.UUID
    agreement_id: uuid.UUID
    description: str
    quantity: Decimal
    unit: str
    rate: Decimal
    rate_override_reason: str | None
    po_value_excl_gst: Decimal
    gst_amount: Decimal
    total_po_value_incl_gst: Decimal
    budget_head_id: uuid.UUID
    delivery_completion_date: date
    po_validity_date: date
    po_date: date
    status: PurchaseOrderStatus
    vendor_acknowledged_at: datetime | None
    over_budget_justification: str | None
    rejection_reason: str | None
    created_at: datetime


class PORejectRequest(BaseModel):
    rejection_reason: str = Field(min_length=1)
