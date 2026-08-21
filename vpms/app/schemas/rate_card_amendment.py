import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import AmendmentStatus


class AmendmentCreate(BaseModel):
    proposed_rate: Decimal
    reason: str


class AmendmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rate_card_id: uuid.UUID
    proposed_rate: Decimal
    reason: str
    status: AmendmentStatus
    requested_by: uuid.UUID
    requested_at: datetime
    approved_by: uuid.UUID | None
    approved_at: datetime | None
