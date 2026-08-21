import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ApprovalLevel, ApprovalStageStatus


class InvoiceApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID
    level: ApprovalLevel
    assigned_role: str
    status: ApprovalStageStatus
    action_taken_by: uuid.UUID | None
    action_at: datetime | None
    comments: str | None
    tat_due_at: datetime
    tat_paused: bool
    created_at: datetime


class ApprovalActionRequest(BaseModel):
    action: str = Field(min_length=1)
    comments: str | None = None
