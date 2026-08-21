import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import KycDocumentStatus, KycDocumentType


class KycDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vendor_id: uuid.UUID
    document_type: KycDocumentType
    file_url: str
    file_hash: str
    status: KycDocumentStatus
    rejection_reason: str | None
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    uploaded_at: datetime


class KycReviewRequest(BaseModel):
    decision: str  # "verify" | "reject"
    rejection_reason: str | None = None

    @model_validator(mode="after")
    def _check_reason(self):
        if self.decision not in ("verify", "reject"):
            raise ValueError("decision must be 'verify' or 'reject'")
        if self.decision == "reject" and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting")
        return self
