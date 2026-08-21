import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import require_role
from app.models.user import User
from app.services import mis_service

router = APIRouter(prefix="/api/v1/mis/dashboard", tags=["mis-dashboard"])

# Finance Head isn't a real seeded role (same substitution as Phase 4A's DoA matrix and
# Phase 4B's payment endpoints) — Finance Team stands in for it here too.
DASHBOARD_ROLES = ("Partner / VP", "Finance Team", "System Admin")


@router.get("/summary")
def get_dashboard_summary(
    vendor_id: uuid.UUID | None = None,
    department: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*DASHBOARD_ROLES)),
):
    return mis_service.dashboard_summary(
        db, vendor_id=vendor_id, department=department, category=category, date_from=date_from, date_to=date_to
    )


@router.get("/aging")
def get_dashboard_aging(
    vendor_id: uuid.UUID | None = None,
    department: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*DASHBOARD_ROLES)),
):
    return mis_service.dashboard_aging(
        db, vendor_id=vendor_id, department=department, category=category, date_from=date_from, date_to=date_to
    )


@router.get("/spend-by-category")
def get_dashboard_spend_by_category(
    vendor_id: uuid.UUID | None = None,
    department: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*DASHBOARD_ROLES)),
):
    return mis_service.dashboard_spend_by_category(
        db, vendor_id=vendor_id, department=department, category=category, date_from=date_from, date_to=date_to
    )
