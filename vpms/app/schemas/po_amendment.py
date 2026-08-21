import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import POAmendmentStatus


class POAmendmentCreate(BaseModel):
    new_quantity: Decimal = Field(gt=0)
    new_rate: Decimal = Field(gt=0)
    new_delivery_date: date
    reason: str


class POAmendmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    po_id: uuid.UUID
    previous_quantity: Decimal
    previous_rate: Decimal
    previous_delivery_date: date
    new_quantity: Decimal
    new_rate: Decimal
    new_delivery_date: date
    reason: str
    status: POAmendmentStatus
    requested_by: uuid.UUID
    approved_by: uuid.UUID | None
    created_at: datetime
