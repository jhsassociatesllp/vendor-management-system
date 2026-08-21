from decimal import Decimal

from pydantic import BaseModel, Field


class BaseBankRateRead(BaseModel):
    base_bank_rate: Decimal


class BaseBankRateUpdate(BaseModel):
    base_bank_rate: Decimal = Field(ge=0)
