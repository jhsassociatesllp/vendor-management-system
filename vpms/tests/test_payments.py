from datetime import date, timedelta
from decimal import Decimal

from app.models.agreement import Agreement
from app.models.invoice import Invoice
from app.models.tds_override_log import TdsOverrideLog
from tests.conftest import TestingSessionLocal
from tests.test_invoice_approvals import create_submitted_invoice, get_approvals_for_invoice, route
from tests.test_invoices import (
    create_invoice,
    make_invoice_payload,
    setup_po_ready_invoice_context,
    upload_all_mandatory_invoice_docs,
)
from tests.test_vendor_portal import auth_header

TWO_PLACES = Decimal("0.01")
DEFAULT_BASE_BANK_RATE = Decimal("6.50")


def set_agreement_credit_period(agreement_id, days):
    db = TestingSessionLocal()
    try:
        row = db.get(Agreement, agreement_id)
        row.credit_period_days = days
        db.add(row)
        db.commit()
    finally:
        db.close()


def set_invoice_payment_due_date(invoice_id, due_date):
    db = TestingSessionLocal()
    try:
        row = db.get(Invoice, invoice_id)
        row.payment_due_date = due_date
        db.add(row)
        db.commit()
    finally:
        db.close()


def get_override_logs_for_payment(payment_id):
    db = TestingSessionLocal()
    try:
        return db.query(TdsOverrideLog).filter(TdsOverrideLog.payment_id == payment_id).all()
    finally:
        db.close()


def create_approved_invoice(
    client,
    login_as,
    pan,
    quantity="1",
    rate="1000.00",
    invoice_number=None,
    msme_status=False,
    credit_period_days=None,
):
    ctx = setup_po_ready_invoice_context(
        client,
        login_as,
        pan,
        msme_status=msme_status,
        rate_card_rate=rate,
        po_quantity=str(Decimal(quantity) + Decimal("5")),
        grn_quantity=quantity,
    )
    if credit_period_days is not None:
        set_agreement_credit_period(ctx["agreement"]["id"], credit_period_days)

    number = invoice_number or f"INV-4B-{pan}"
    payload = make_invoice_payload(
        ctx["po"]["id"], ctx["agreement"]["id"], ctx["item_code_id"], number, quantity=quantity, rate=rate
    )
    inv = create_invoice(client, ctx["token"], payload).json()
    upload_all_mandatory_invoice_docs(client, ctx["token"], inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(ctx["token"]))
    assert submit.status_code == 200
    invoice = submit.json()

    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id
    accounts_headers = login_as("accounts@test.com")
    verify = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers
    )
    assert verify.status_code == 200

    l4_id = get_approvals_for_invoice(invoice["id"])["L4"].id
    finance_headers = login_as("finance@test.com")
    approve = client.post(
        f"/api/v1/invoice-approvals/{l4_id}/action", json={"action": "Approve_For_Payment"}, headers=finance_headers
    )
    assert approve.status_code == 200

    final = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    return final, ctx


def make_payment_payload(invoice_id, **overrides):
    payload = {
        "invoice_id": invoice_id,
        "payment_mode": "NEFT",
        "company_bank_account": "JHS-001-0011",
        "payment_date": date.today().isoformat(),
        "utr_reference": "UTR000000001",
        "itc_eligible": True,
    }
    payload.update(overrides)
    return payload


def test_payment_blocked_if_invoice_not_approved_for_payment(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "PAYAA1111A")
    finance_headers = login_as("finance@test.com")

    resp = client.post("/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=finance_headers)
    assert resp.status_code == 400


def test_tds_auto_calculated_from_default(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYBB1111B")
    finance_headers = login_as("finance@test.com")

    resp = client.post("/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=finance_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["tds_section"] == "194C"
    assert body["tds_rate"] == "2.00"
    expected_tds = (Decimal(invoice["total_invoice_amount"]) * Decimal("2.00") / Decimal(100)).quantize(TWO_PLACES)
    assert Decimal(body["tds_amount"]) == expected_tds


def test_tds_override_requires_reason_and_logs(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYCC1111C")
    finance_headers = login_as("finance@test.com")

    no_reason = client.post(
        "/api/v1/payments",
        json=make_payment_payload(invoice["id"], tds_rate="5.00"),
        headers=finance_headers,
    )
    assert no_reason.status_code == 422

    with_reason = client.post(
        "/api/v1/payments",
        json=make_payment_payload(invoice["id"], tds_rate="5.00", tds_override_reason="Special rate agreed"),
        headers=finance_headers,
    )
    assert with_reason.status_code == 201
    body = with_reason.json()
    assert body["tds_rate"] == "5.00"

    logs = get_override_logs_for_payment(body["id"])
    assert len(logs) == 1
    assert logs[0].original_rate == Decimal("2.00")
    assert logs[0].new_rate == Decimal("5.00")
    assert logs[0].reason == "Special rate agreed"


def test_net_payable_computed_correctly(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYDD1111D")
    finance_headers = login_as("finance@test.com")

    resp = client.post("/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=finance_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert Decimal(body["net_payable_amount"]) == Decimal(body["gross_amount"]) - Decimal(body["tds_amount"])


def test_maker_cannot_be_checker(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYEE1111E")
    finance_headers = login_as("finance@test.com")

    payment = client.post(
        "/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=finance_headers
    ).json()

    confirm = client.post(f"/api/v1/payments/{payment['id']}/confirm", headers=finance_headers)
    assert confirm.status_code == 403


def test_checker_confirm_marks_invoice_paid(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYFF1111F")
    finance_headers = login_as("finance@test.com")
    finance2_headers = login_as("finance2@test.com")

    payment = client.post(
        "/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=finance_headers
    ).json()

    confirm = client.post(f"/api/v1/payments/{payment['id']}/confirm", headers=finance2_headers)
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "Checker_Confirmed"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=finance_headers).json()
    assert inv["status"] == "Paid"

    view = client.get(f"/api/v1/payments/{payment['id']}", headers=finance_headers).json()
    assert view["utr_reference"] == "UTR000000001"


def test_checker_reject_leaves_invoice_approved_for_payment(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYGG1111G")
    finance_headers = login_as("finance@test.com")
    finance2_headers = login_as("finance2@test.com")

    payment = client.post(
        "/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=finance_headers
    ).json()

    reject = client.post(
        f"/api/v1/payments/{payment['id']}/reject", json={"reason": "UTR does not match"}, headers=finance2_headers
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "Rejected"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=finance_headers).json()
    assert inv["status"] == "Approved_For_Payment"


def test_duplicate_confirmed_payment_blocked(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYHH1111H")
    finance_headers = login_as("finance@test.com")
    finance2_headers = login_as("finance2@test.com")

    payment = client.post(
        "/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=finance_headers
    ).json()
    confirm = client.post(f"/api/v1/payments/{payment['id']}/confirm", headers=finance2_headers)
    assert confirm.status_code == 200

    second = client.post(
        "/api/v1/payments",
        json=make_payment_payload(invoice["id"], utr_reference="UTR000000002"),
        headers=finance_headers,
    )
    assert second.status_code == 400


def test_queue_sorted_by_payment_due_date(client, login_as):
    early, ctx1 = create_approved_invoice(client, login_as, "PAYII1111I", credit_period_days=5)
    late, ctx2 = create_approved_invoice(client, login_as, "PAYJJ1111J", credit_period_days=50)

    finance_headers = login_as("finance@test.com")
    queue = client.get("/api/v1/payments/queue", headers=finance_headers).json()
    ids = [row["id"] for row in queue]
    assert ids.index(early["id"]) < ids.index(late["id"])


def test_msme_due_date_uses_earlier_of_credit_period_or_45_days(client, login_as):
    invoice, ctx = create_approved_invoice(
        client, login_as, "PAYKK1111K", msme_status=True, credit_period_days=90
    )
    assert invoice["payment_due_date"] == (date.today() + timedelta(days=45)).isoformat()


def test_msme_alerts_flags_at_risk_and_overdue(client, login_as):
    at_risk, ctx1 = create_approved_invoice(
        client, login_as, "PAYLL1111L", msme_status=True, credit_period_days=3
    )
    overdue, ctx2 = create_approved_invoice(client, login_as, "PAYMM1111M", msme_status=True, credit_period_days=30)
    set_invoice_payment_due_date(overdue["id"], date.today() - timedelta(days=2))

    finance_headers = login_as("finance@test.com")
    alerts = client.get("/api/v1/payments/msme-alerts", headers=finance_headers).json()
    by_id = {row["invoice_id"]: row["alert_type"] for row in alerts}

    assert by_id.get(at_risk["id"]) == "At_Risk"
    assert by_id.get(overdue["id"]) == "Overdue"


def test_late_payment_interest_flagged_when_paid_after_due_date(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYNN1111N", credit_period_days=5)
    due_date = date.today() + timedelta(days=5)
    late_payment_date = due_date + timedelta(days=10)

    finance_headers = login_as("finance@test.com")
    resp = client.post(
        "/api/v1/payments",
        json=make_payment_payload(invoice["id"], payment_date=late_payment_date.isoformat()),
        headers=finance_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_late"] is True

    net_payable = Decimal(body["net_payable_amount"])
    annual_rate = (DEFAULT_BASE_BANK_RATE + Decimal("3")) / Decimal(100)
    expected_interest = (net_payable * annual_rate * Decimal(10) / Decimal(365)).quantize(TWO_PLACES)
    assert Decimal(body["late_payment_interest_amount"]) == expected_interest


def test_mandatory_fields_enforced(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYOO1111O")
    finance_headers = login_as("finance@test.com")

    payload = make_payment_payload(invoice["id"])
    del payload["utr_reference"]

    resp = client.post("/api/v1/payments", json=payload, headers=finance_headers)
    assert resp.status_code == 422


def test_non_finance_role_blocked_from_recording_payment(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "PAYPP1111P")
    accounts_headers = login_as("accounts@test.com")

    resp = client.post("/api/v1/payments", json=make_payment_payload(invoice["id"]), headers=accounts_headers)
    assert resp.status_code == 403
