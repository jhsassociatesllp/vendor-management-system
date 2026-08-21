import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ItemCodeCreate(BaseModel):
    category: str
    sub_category: str
    description: str
    unit: str
    default_rate: Decimal


class ItemCodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    sub_category: str
    description: str
    unit: str
    default_rate: Decimal
    is_active: bool
