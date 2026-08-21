from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import AuditAction
from app.schemas.auth import LoginRequest, TokenResponse
from app.services import audit_service, auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    try:
        user = auth_service.authenticate_user(db, payload.email, payload.password)
    except auth_service.InvalidCredentialsError:
        audit_service.log_audit(
            db,
            action=AuditAction.LOGIN_FAILED,
            module="Auth",
            record_reference=payload.email,
            user_name_snapshot=payload.email,
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = auth_service.issue_token_for_user(user)
    audit_service.log_audit(
        db, action=AuditAction.LOGIN, module="Auth", record_reference=user.email, user=user, request=request
    )
    return TokenResponse(access_token=token)
