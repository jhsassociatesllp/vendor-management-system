import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ApprovalLevel, QueryStatus


class QueryCreate(BaseModel):
    query_text: str = Field(min_length=1)


class QueryRespond(BaseModel):
    vendor_response: str = Field(min_length=1)


class InvoiceQueryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID
    raised_at_level: ApprovalLevel
    raised_by: uuid.UUID
    query_text: str
    status: QueryStatus
    vendor_response: str | None
    responded_at: datetime | None
    created_at: datetime
