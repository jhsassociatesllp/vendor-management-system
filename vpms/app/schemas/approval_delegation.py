import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator


class DelegationCreate(BaseModel):
    delegate_user_id: uuid.UUID
    valid_from: date
    valid_to: date
    # Only honored when the caller is System Admin (Section 6: "emergency delegation").
    # For a self-delegation, the caller is always the delegator; any value sent here by
    # a non-admin caller is ignored by the service.
    delegator_user_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _check_dates(self):
        if self.valid_to < self.valid_from:
            raise ValueError("valid_to must be on or after valid_from")
        return self


class DelegationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    delegator_user_id: uuid.UUID
    delegate_user_id: uuid.UUID
    valid_from: date
    valid_to: date
    created_by: uuid.UUID
    created_at: datetime
