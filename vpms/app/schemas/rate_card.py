import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import PricingType

RATE_REQUIRED_PRICING_TYPES = (PricingType.FIXED, PricingType.PER_UNIT)


class RateCardCreate(BaseModel):
    item_code_id: uuid.UUID
    pricing_type: PricingType
    rate: Decimal | None = None
    effective_from: date
    effective_to: date | None = None

    @model_validator(mode="after")
    def _check_rate_required(self):
        if self.pricing_type in RATE_REQUIRED_PRICING_TYPES and self.rate is None:
            raise ValueError(f"rate is required for pricing_type {self.pricing_type.value}")
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("effective_to must be on or after effective_from")
        return self


class RateCardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_id: uuid.UUID
    item_code_id: uuid.UUID
    pricing_type: PricingType
    rate: Decimal | None
    effective_from: date
    effective_to: date | None
    is_active: bool
    created_at: datetime
