import hashlib
import uuid
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOADS_ROOT = BASE_DIR / "uploads"
UPLOADS_DIR = UPLOADS_ROOT / "kyc"
INVOICE_UPLOADS_DIR = UPLOADS_ROOT / "invoices"


def save_upload_and_hash(vendor_id: uuid.UUID, filename: str, content: bytes) -> tuple[str, str]:
    """Stub file storage (local path) per Section 9, but a real SHA-256 hash per Section 5.6."""
    vendor_dir = UPLOADS_DIR / str(vendor_id)
    vendor_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid.uuid4()}_{filename}"
    destination = vendor_dir / stored_name
    destination.write_bytes(content)

    file_hash = hashlib.sha256(content).hexdigest()
    file_url = f"/uploads/kyc/{vendor_id}/{stored_name}"
    return file_url, file_hash


def save_invoice_document_and_hash(invoice_id: uuid.UUID, filename: str, content: bytes) -> tuple[str, str]:
    """Same stub-storage/real-hash pattern as save_upload_and_hash, under uploads/invoices/
    instead of uploads/kyc/ — Phase 3B's invoice supporting documents (Section 3.2)."""
    invoice_dir = INVOICE_UPLOADS_DIR / str(invoice_id)
    invoice_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid.uuid4()}_{filename}"
    destination = invoice_dir / stored_name
    destination.write_bytes(content)

    file_hash = hashlib.sha256(content).hexdigest()
    file_url = f"/uploads/invoices/{invoice_id}/{stored_name}"
    return file_url, file_hash


class InvalidStoredPathError(Exception):
    pass


def resolve_upload_path(file_url: str) -> Path:
    """Maps a stored `file_url` (e.g. "/uploads/kyc/{vendor_id}/{name}") back to an
    absolute filesystem path, rejecting anything that would escape UPLOADS_ROOT.
    KYC documents are sensitive PII, so this backs an authenticated download endpoint
    rather than a public static mount — see kyc_service.get_document_file."""
    relative = file_url.lstrip("/")
    candidate = (BASE_DIR / relative).resolve()

    try:
        candidate.relative_to(UPLOADS_ROOT.resolve())
    except ValueError:
        raise InvalidStoredPathError("Stored file path is outside the uploads directory")

    if not candidate.is_file():
        raise InvalidStoredPathError("Stored file no longer exists")

    return candidate
