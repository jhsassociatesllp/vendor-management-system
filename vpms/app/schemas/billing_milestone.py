import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import MilestoneStatus


class MilestoneCreate(BaseModel):
    description: str
    percentage_of_contract_value: Decimal
    expected_date: date
    deliverables: str


class MilestoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_id: uuid.UUID
    description: str
    percentage_of_contract_value: Decimal
    expected_date: date
    deliverables: str
    status: MilestoneStatus
