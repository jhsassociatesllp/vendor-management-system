import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import InvoiceDocumentType


class InvoiceDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID
    document_type: InvoiceDocumentType
    is_mandatory: bool
    file_url: str
    file_hash: str
    uploaded_at: datetime
