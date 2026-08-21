import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BudgetPeriodType


class BudgetHeadCreate(BaseModel):
    department: str
    cost_centre: str
    period_type: BudgetPeriodType
    period_label: str
    sanctioned_amount: Decimal = Field(gt=0)


class BudgetHeadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    department: str
    cost_centre: str
    period_type: BudgetPeriodType
    period_label: str
    sanctioned_amount: Decimal
    created_at: datetime


class BudgetAvailabilityRead(BaseModel):
    budget_head_id: uuid.UUID
    sanctioned_amount: Decimal
    committed_amount: Decimal
    available_amount: Decimal
