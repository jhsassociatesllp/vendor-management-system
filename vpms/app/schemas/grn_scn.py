import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import GrnScnType


class GrnScnCreate(BaseModel):
    type: GrnScnType
    quantity_confirmed: Decimal = Field(gt=0)
    description: str


class GrnScnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    po_id: uuid.UUID
    type: GrnScnType
    quantity_confirmed: Decimal
    description: str
    created_by: uuid.UUID
    created_at: datetime
