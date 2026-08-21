import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DoaMatrixCreate(BaseModel):
    min_amount: Decimal = Field(ge=0)
    max_amount: Decimal | None = None
    requires_l2: bool
    requires_l3: bool
    l1_role: str = "Accounts Executive"
    l2_role: str | None = None
    l3_role: str | None = None
    l4_role: str
    l1_tat_days: int = Field(default=1, gt=0)
    l2_tat_days: int = Field(default=2, gt=0)
    l3_tat_days: int = Field(default=2, gt=0)
    l4_tat_days: int = Field(default=1, gt=0)

    @model_validator(mode="after")
    def _check_consistency(self):
        if self.max_amount is not None and self.max_amount < self.min_amount:
            raise ValueError("max_amount must be on or above min_amount")
        if self.requires_l2 and not self.l2_role:
            raise ValueError("l2_role is required when requires_l2 is true")
        if self.requires_l3 and not self.l3_role:
            raise ValueError("l3_role is required when requires_l3 is true")
        return self


class DoaMatrixRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    min_amount: Decimal
    max_amount: Decimal | None
    requires_l2: bool
    requires_l3: bool
    l1_role: str
    l2_role: str | None
    l3_role: str | None
    l4_role: str
    l1_tat_days: int
    l2_tat_days: int
    l3_tat_days: int
    l4_tat_days: int
    created_at: datetime
