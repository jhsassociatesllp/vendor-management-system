import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import doa_matrix_repository
from app.schemas.doa_matrix import DoaMatrixCreate, DoaMatrixRead
from app.services import audit_service, invoice_approval_service

router = APIRouter(prefix="/api/v1/doa-matrix", tags=["doa-matrix"])


@router.post("", response_model=DoaMatrixRead, status_code=status.HTTP_201_CREATED)
def create_doa_matrix_row(
    payload: DoaMatrixCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    result = invoice_approval_service.create_doa_matrix_row(db, payload)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="DoaMatrix",
        record_reference=f"{result.min_amount}-{result.max_amount or 'unbounded'}",
        user=current_user,
        request=request,
    )
    return result


@router.get("", response_model=list[DoaMatrixRead])
def list_doa_matrix(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return invoice_approval_service.list_doa_matrix(db)


@router.patch("/{matrix_id}", response_model=DoaMatrixRead)
def update_doa_matrix_row(
    matrix_id: uuid.UUID,
    payload: DoaMatrixCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    before = audit_service.model_to_dict(doa_matrix_repository.get_by_id(db, matrix_id))
    try:
        result = invoice_approval_service.update_doa_matrix_row(db, matrix_id, payload)
    except invoice_approval_service.DoaMatrixNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="DoaMatrix",
        record_reference=f"{result.min_amount}-{result.max_amount or 'unbounded'}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
