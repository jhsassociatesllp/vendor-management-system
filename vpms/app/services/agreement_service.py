import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.agreement import Agreement
from app.models.enums import AgreementStatus
from app.models.user import User
from app.repositories import agreement_repository, vendor_repository
from app.schemas.agreement import AgreementCreate, AgreementRead


class VendorNotActiveError(Exception):
    pass


class ItemCodeNotFoundError(Exception):
    pass


class TdsOverrideReasonRequiredError(Exception):
    pass


class AgreementNotFoundError(Exception):
    pass


def compute_effective_status(agreement: Agreement) -> AgreementStatus:
    if agreement.status == AgreementStatus.TERMINATED:
        return AgreementStatus.TERMINATED
    if agreement.agreement_end_date < date.today():
        return AgreementStatus.EXPIRED
    return AgreementStatus.ACTIVE


def to_agreement_read(agreement: Agreement) -> AgreementRead:
    return AgreementRead(
        id=agreement.id,
        agreement_number=agreement.agreement_number,
        vendor_id=agreement.vendor_id,
        scope_of_work=agreement.scope_of_work,
        supporting_document_url=agreement.supporting_document_url,
        billing_frequency=agreement.billing_frequency,
        agreement_start_date=agreement.agreement_start_date,
        agreement_end_date=agreement.agreement_end_date,
        auto_renewal_flag=agreement.auto_renewal_flag,
        po_requirement=agreement.po_requirement,
        credit_period_days=agreement.credit_period_days,
        tds_section=agreement.tds_section,
        tds_override_reason=agreement.tds_override_reason,
        gst_rate=agreement.gst_rate,
        reverse_charge_flag=agreement.reverse_charge_flag,
        approved_by_designation=agreement.approved_by_designation,
        status=compute_effective_status(agreement),
        created_at=agreement.created_at,
        covered_item_code_ids=[item.id for item in agreement.covered_item_codes],
    )


def create_agreement(db: Session, payload: AgreementCreate, current_user: User) -> Agreement:
    vendor = vendor_repository.get_by_id(db, payload.vendor_id)
    if vendor is None or not vendor.is_active:
        raise VendorNotActiveError("Vendor must exist and be active")

    if not agreement_repository.item_codes_exist(db, payload.item_code_ids):
        raise ItemCodeNotFoundError("One or more item codes do not exist")

    tds_section = payload.tds_section or vendor.tds_section
    if tds_section != vendor.tds_section and not payload.tds_override_reason:
        raise TdsOverrideReasonRequiredError(
            "tds_override_reason is required when tds_section differs from the vendor's default"
        )

    agreement_number = agreement_repository.next_agreement_number(db, payload.agreement_start_date.year)

    initial_status = (
        AgreementStatus.EXPIRED if payload.agreement_end_date < date.today() else AgreementStatus.ACTIVE
    )

    agreement = Agreement(
        agreement_number=agreement_number,
        vendor_id=payload.vendor_id,
        scope_of_work=payload.scope_of_work,
        supporting_document_url=payload.supporting_document_url,
        billing_frequency=payload.billing_frequency,
        agreement_start_date=payload.agreement_start_date,
        agreement_end_date=payload.agreement_end_date,
        auto_renewal_flag=payload.auto_renewal_flag,
        po_requirement=payload.po_requirement,
        credit_period_days=payload.credit_period_days,
        tds_section=tds_section,
        tds_override_reason=payload.tds_override_reason,
        gst_rate=payload.gst_rate,
        reverse_charge_flag=payload.reverse_charge_flag,
        approved_by_designation=payload.approved_by_designation,
        status=initial_status,
    )

    return agreement_repository.create(db, agreement, payload.item_code_ids)


def get_agreement(db: Session, agreement_id: uuid.UUID) -> Agreement | None:
    return agreement_repository.get_by_id(db, agreement_id)


def list_agreements(db: Session) -> list[Agreement]:
    return agreement_repository.list_all(db)


def list_expiring(db: Session, days: int) -> list[Agreement]:
    return agreement_repository.list_expiring_within(db, days)


def terminate_agreement(db: Session, agreement_id: uuid.UUID) -> Agreement:
    agreement = agreement_repository.get_by_id(db, agreement_id)
    if agreement is None:
        raise AgreementNotFoundError("Agreement not found")

    agreement.status = AgreementStatus.TERMINATED
    return agreement_repository.save(db, agreement)
