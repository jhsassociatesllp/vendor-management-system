import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.billing_milestone import BillingMilestone
from app.models.enums import AgreementStatus, AmendmentStatus
from app.models.rate_card import RateCard
from app.models.rate_card_amendment import RateCardAmendment
from app.models.user import User
from app.repositories import (
    agreement_repository,
    billing_milestone_repository,
    rate_card_amendment_repository,
    rate_card_repository,
)
from app.schemas.billing_milestone import MilestoneCreate
from app.schemas.rate_card import RateCardCreate
from app.schemas.rate_card_amendment import AmendmentCreate


class AgreementNotFoundError(Exception):
    pass


class RateCardNotFoundError(Exception):
    pass


class AmendmentNotFoundError(Exception):
    pass


class ItemNotCoveredError(Exception):
    pass


class AgreementTerminatedError(Exception):
    pass


class DatesOutOfRangeError(Exception):
    pass


class MilestoneTotalExceededError(Exception):
    pass


class AmendmentSelfApprovalError(Exception):
    pass


class AmendmentNotPendingError(Exception):
    pass


def create_rate_card(db: Session, agreement_id: uuid.UUID, payload: RateCardCreate) -> RateCard:
    agreement = agreement_repository.get_by_id(db, agreement_id)
    if agreement is None:
        raise AgreementNotFoundError("Agreement not found")

    if agreement.status == AgreementStatus.TERMINATED:
        raise AgreementTerminatedError("Cannot add a rate card to a terminated agreement")

    covered_ids = {item.id for item in agreement.covered_item_codes}
    if payload.item_code_id not in covered_ids:
        raise ItemNotCoveredError("Item code is not covered by this agreement")

    if not (agreement.agreement_start_date <= payload.effective_from <= agreement.agreement_end_date):
        raise DatesOutOfRangeError("effective_from must fall within the agreement's start/end dates")

    if payload.effective_to is not None and not (
        agreement.agreement_start_date <= payload.effective_to <= agreement.agreement_end_date
    ):
        raise DatesOutOfRangeError("effective_to must fall within the agreement's start/end dates")

    rate_card = RateCard(
        agreement_id=agreement_id,
        item_code_id=payload.item_code_id,
        pricing_type=payload.pricing_type,
        rate=payload.rate,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        is_active=True,
    )
    return rate_card_repository.create(db, rate_card)


def list_rate_cards(db: Session, agreement_id: uuid.UUID) -> list[RateCard]:
    return rate_card_repository.list_for_agreement(db, agreement_id)


def create_milestone(db: Session, agreement_id: uuid.UUID, payload: MilestoneCreate) -> BillingMilestone:
    agreement = agreement_repository.get_by_id(db, agreement_id)
    if agreement is None:
        raise AgreementNotFoundError("Agreement not found")

    if agreement.status == AgreementStatus.TERMINATED:
        raise AgreementTerminatedError("Cannot add a milestone to a terminated agreement")

    existing_total = billing_milestone_repository.total_percentage_for_agreement(db, agreement_id)
    if existing_total + payload.percentage_of_contract_value > 100:
        raise MilestoneTotalExceededError("Milestone percentages for this agreement would exceed 100%")

    milestone = BillingMilestone(
        agreement_id=agreement_id,
        description=payload.description,
        percentage_of_contract_value=payload.percentage_of_contract_value,
        expected_date=payload.expected_date,
        deliverables=payload.deliverables,
    )
    return billing_milestone_repository.create(db, milestone)


def propose_amendment(db: Session, rate_card_id: uuid.UUID, payload: AmendmentCreate, requester: User) -> RateCardAmendment:
    rate_card = rate_card_repository.get_by_id(db, rate_card_id)
    if rate_card is None:
        raise RateCardNotFoundError("Rate card not found")

    amendment = RateCardAmendment(
        rate_card_id=rate_card_id,
        proposed_rate=payload.proposed_rate,
        reason=payload.reason,
        status=AmendmentStatus.PENDING,
        requested_by=requester.id,
    )
    return rate_card_amendment_repository.create(db, amendment)


def approve_amendment(db: Session, amendment_id: uuid.UUID, approver: User) -> RateCardAmendment:
    amendment = rate_card_amendment_repository.get_by_id(db, amendment_id)
    if amendment is None:
        raise AmendmentNotFoundError("Amendment not found")

    if amendment.status != AmendmentStatus.PENDING:
        raise AmendmentNotPendingError(f"Amendment is not Pending (current status: {amendment.status.value})")

    if amendment.requested_by == approver.id:
        raise AmendmentSelfApprovalError("The user who proposed an amendment cannot also approve it")

    old_rate_card = rate_card_repository.get_by_id(db, amendment.rate_card_id)
    if old_rate_card is None:
        raise RateCardNotFoundError("Rate card not found")

    today = date.today()
    new_rate_card = RateCard(
        agreement_id=old_rate_card.agreement_id,
        item_code_id=old_rate_card.item_code_id,
        pricing_type=old_rate_card.pricing_type,
        rate=amendment.proposed_rate,
        effective_from=today,
        effective_to=None,
        is_active=True,
    )
    db.add(new_rate_card)

    old_rate_card.effective_to = today - timedelta(days=1)
    old_rate_card.is_active = False
    db.add(old_rate_card)

    amendment.status = AmendmentStatus.APPROVED
    amendment.approved_by = approver.id
    amendment.approved_at = datetime.now(timezone.utc)
    db.add(amendment)

    db.commit()
    db.refresh(amendment)
    return amendment


def reject_amendment(db: Session, amendment_id: uuid.UUID, approver: User) -> RateCardAmendment:
    amendment = rate_card_amendment_repository.get_by_id(db, amendment_id)
    if amendment is None:
        raise AmendmentNotFoundError("Amendment not found")

    if amendment.status != AmendmentStatus.PENDING:
        raise AmendmentNotPendingError(f"Amendment is not Pending (current status: {amendment.status.value})")

    if amendment.requested_by == approver.id:
        raise AmendmentSelfApprovalError("The user who proposed an amendment cannot also reject it")

    amendment.status = AmendmentStatus.REJECTED
    amendment.approved_by = approver.id
    amendment.approved_at = datetime.now(timezone.utc)
    return rate_card_amendment_repository.save(db, amendment)
