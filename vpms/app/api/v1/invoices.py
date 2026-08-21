import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction, InvoiceDocumentType
from app.models.user import User
from app.repositories import invoice_query_repository, invoice_repository
from app.schemas.invoice import InvoiceCreate, InvoiceRead
from app.schemas.invoice_approval import InvoiceApprovalRead
from app.schemas.invoice_document import InvoiceDocumentRead
from app.schemas.invoice_query import InvoiceQueryRead, QueryCreate, QueryRespond
from app.schemas.payment import PaymentRead
from app.services import audit_service, invoice_approval_service, invoice_service, payment_service

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Vendor")),
):
    try:
        result = invoice_service.create_invoice(db, payload, current_user)
    except invoice_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except invoice_service.AgreementNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_service.ItemMismatchError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except invoice_service.MilestoneMismatchError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except invoice_service.TotalAmountMismatchError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    audit_service.log_audit(
        db, action=AuditAction.CREATE, module="Invoice", record_reference=result.invoice_number, user=current_user, request=request
    )
    return result


@router.post("/{invoice_id}/documents", response_model=InvoiceDocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_invoice_document(
    invoice_id: uuid.UUID,
    request: Request,
    document_type: InvoiceDocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Vendor")),
):
    content = await file.read()
    try:
        result = invoice_service.upload_document(db, invoice_id, document_type, file.filename, content, current_user)
    except invoice_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except invoice_service.AlreadySubmittedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    invoice = invoice_repository.get_by_id(db, invoice_id)
    audit_service.log_audit(
        db,
        action=AuditAction.DOCUMENT_UPLOAD,
        module="InvoiceDocument",
        record_reference=f"{document_type.value} / {invoice.invoice_number if invoice else invoice_id}",
        user=current_user,
        request=request,
    )
    return result


@router.get("/{invoice_id}/documents", response_model=list[InvoiceDocumentRead])
def list_invoice_documents(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added for Phase 3 UI's invoice-detail.html — no list endpoint existed before,
    only the upload POST."""
    try:
        return invoice_service.list_documents(db, invoice_id, current_user)
    except invoice_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/{invoice_id}/submit", response_model=InvoiceRead)
def submit_invoice(
    invoice_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Vendor")),
):
    before = audit_service.model_to_dict(invoice_repository.get_by_id(db, invoice_id))
    try:
        result = invoice_service.submit_invoice(db, invoice_id, current_user)
    except invoice_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except invoice_service.AlreadySubmittedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except invoice_service.InvoiceValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="Invoice",
        record_reference=result.invoice_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return invoice_service.list_invoices(db, current_user)


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return invoice_service.get_invoice(db, invoice_id, current_user)
    except invoice_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/documents/{document_id}/file")
def download_invoice_document_file(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added for Phase 3 UI's invoice-detail.html document view/download links —
    mirrors kyc_documents.download_document_file's authenticated-download pattern
    since invoice supporting documents are similarly sensitive."""
    try:
        document, path = invoice_service.get_document_file(db, document_id, current_user)
    except invoice_service.InvoiceDocumentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except invoice_service.FileUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    filename = path.name.split("_", 1)[-1] if "_" in path.name else path.name
    return FileResponse(path, filename=filename)


@router.post("/{invoice_id}/route-for-approval", response_model=InvoiceRead)
def route_for_approval(
    invoice_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    before = audit_service.model_to_dict(invoice_repository.get_by_id(db, invoice_id))
    try:
        result = invoice_approval_service.route_for_approval(db, invoice_id, current_user)
    except invoice_approval_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.InvalidStateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except invoice_approval_service.NoMatchingSlabError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="Invoice",
        record_reference=result.invoice_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.get("/{invoice_id}/approvals", response_model=list[InvoiceApprovalRead])
def list_invoice_approvals(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added for Phase 4 UI's workflow timeline — Phase 4A shipped without a
    list-by-invoice endpoint since nothing needed it through the API yet (tests fetched
    rows directly via a DB session). The timeline needs all 4 stages at once."""
    try:
        return invoice_approval_service.list_approvals_for_invoice(db, invoice_id, current_user)
    except invoice_approval_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/{invoice_id}/queries", response_model=list[InvoiceQueryRead])
def list_invoice_queries(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return invoice_approval_service.list_queries_for_invoice(db, invoice_id, current_user)
    except invoice_approval_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/{invoice_id}/payment", response_model=PaymentRead)
def get_invoice_payment(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return payment_service.get_confirmed_payment_for_invoice(db, invoice_id, current_user)
    except payment_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except payment_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except payment_service.PaymentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/{invoice_id}/queries", response_model=InvoiceQueryRead, status_code=status.HTTP_201_CREATED)
def raise_query(
    invoice_id: uuid.UUID,
    payload: QueryCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = invoice_approval_service.raise_query(db, invoice_id, payload.query_text, current_user)
    except invoice_approval_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.InvalidStateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except invoice_approval_service.StageNotActiveError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except invoice_approval_service.NotAuthorizedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    invoice = invoice_repository.get_by_id(db, invoice_id)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="InvoiceQuery",
        record_reference=invoice.invoice_number if invoice else str(invoice_id),
        user=current_user,
        request=request,
    )
    return result


@router.post("/{invoice_id}/queries/{query_id}/respond", response_model=InvoiceQueryRead)
def respond_to_query(
    invoice_id: uuid.UUID,
    query_id: uuid.UUID,
    payload: QueryRespond,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Vendor")),
):
    before = audit_service.model_to_dict(invoice_query_repository.get_by_id(db, query_id))
    try:
        result = invoice_approval_service.respond_to_query(db, invoice_id, query_id, payload.vendor_response, current_user)
    except invoice_approval_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except invoice_approval_service.QueryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.QueryAlreadyRespondedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    invoice = invoice_repository.get_by_id(db, invoice_id)
    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="InvoiceQuery",
        record_reference=invoice.invoice_number if invoice else str(invoice_id),
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{invoice_id}/resubmit", response_model=InvoiceRead)
def resubmit_invoice(
    invoice_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Vendor")),
):
    before = audit_service.model_to_dict(invoice_repository.get_by_id(db, invoice_id))
    try:
        result = invoice_approval_service.resubmit(db, invoice_id, current_user)
    except invoice_approval_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except invoice_approval_service.InvalidStateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="Invoice",
        record_reference=result.invoice_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
