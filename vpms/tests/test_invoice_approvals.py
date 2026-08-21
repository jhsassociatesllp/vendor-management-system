from datetime import date, timedelta
from decimal import Decimal

from app.models.invoice_approval import InvoiceApproval
from tests.conftest import TestingSessionLocal
from tests.test_invoices import (
    create_invoice,
    make_invoice_payload,
    setup_po_ready_invoice_context,
    upload_all_mandatory_invoice_docs,
)
from tests.test_vendor_portal import auth_header


def get_approvals_for_invoice(invoice_id):
    db = TestingSessionLocal()
    try:
        rows = db.query(InvoiceApproval).filter(InvoiceApproval.invoice_id == invoice_id).all()
        return {r.level.value: r for r in rows}
    finally:
        db.close()


def backdate_tat(approval_id):
    db = TestingSessionLocal()
    try:
        row = db.get(InvoiceApproval, approval_id)
        row.tat_due_at = row.tat_due_at.replace(year=2000)
        db.add(row)
        db.commit()
    finally:
        db.close()


def create_submitted_invoice(client, login_as, pan, quantity="5", rate="1000.00", invoice_number=None):
    ctx = setup_po_ready_invoice_context(
        client,
        login_as,
        pan,
        rate_card_rate=rate,
        po_quantity=str(Decimal(quantity) + Decimal("5")),
        grn_quantity=quantity,
    )
    number = invoice_number or f"INV-4A-{pan}"
    payload = make_invoice_payload(
        ctx["po"]["id"], ctx["agreement"]["id"], ctx["item_code_id"], number, quantity=quantity, rate=rate
    )
    inv = create_invoice(client, ctx["token"], payload).json()
    upload_all_mandatory_invoice_docs(client, ctx["token"], inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(ctx["token"]))
    assert submit.status_code == 200
    return submit.json(), ctx


def route(client, login_as, invoice_id):
    accounts_headers = login_as("accounts@test.com")
    resp = client.post(f"/api/v1/invoices/{invoice_id}/route-for-approval", headers=accounts_headers)
    assert resp.status_code == 200
    return resp.json()


def test_routing_selects_correct_slab_low_amount(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAAA1111A", quantity="1", rate="1000.00")
    routed = route(client, login_as, invoice["id"])
    assert routed["status"] == "L1_Verification"

    approvals = get_approvals_for_invoice(invoice["id"])
    assert approvals["L2"].status.value == "Skipped"
    assert approvals["L3"].status.value == "Skipped"
    assert approvals["L1"].status.value == "Pending"
    assert approvals["L4"].status.value == "Pending"


def test_routing_selects_correct_slab_high_amount(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOABB1111B", quantity="1000", rate="1000.00")
    assert Decimal(invoice["total_invoice_amount"]) > Decimal("1000000")
    route(client, login_as, invoice["id"])

    approvals = get_approvals_for_invoice(invoice["id"])
    assert approvals["L2"].status.value == "Pending"
    assert approvals["L3"].status.value == "Pending"


def test_l1_verify_skips_to_l4_when_l2_l3_skipped(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOACC1111C", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    action = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers
    )
    assert action.status_code == 200
    assert action.json()["status"] == "Completed"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "L4_Finance_Approval"


def test_l1_verify_advances_to_l2_when_required(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOADD1111D", quantity="1000", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    client.post(f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers)

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "L2_Review"


def test_l1_reject_is_terminal(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAEE1111E", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    action = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action",
        json={"action": "Reject", "comments": "Not compliant"},
        headers=accounts_headers,
    )
    assert action.status_code == 200
    assert action.json()["status"] == "Rejected"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "Rejected"

    again = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers
    )
    assert again.status_code == 400


def test_l1_return_to_vendor_sets_status(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAFF1111F", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    action = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action",
        json={"action": "Return_To_Vendor", "comments": "Fix GST breakup"},
        headers=accounts_headers,
    )
    assert action.status_code == 200

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "Returned_To_Vendor"


def test_action_blocked_for_wrong_role(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAGG1111G", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    deptmgr_headers = login_as("deptmanager@test.com")
    action = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=deptmgr_headers
    )
    assert action.status_code == 403


def test_l2_return_to_accounts_resets_l1(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAHH1111H", quantity="1000", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    client.post(f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers)

    l2_id = get_approvals_for_invoice(invoice["id"])["L2"].id
    deptmgr_headers = login_as("deptmanager@test.com")
    action = client.post(
        f"/api/v1/invoice-approvals/{l2_id}/action",
        json={"action": "Return_To_Accounts", "comments": "Check budget head"},
        headers=deptmgr_headers,
    )
    assert action.status_code == 200
    assert action.json()["status"] == "Returned"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "L1_Verification"

    l1_after = get_approvals_for_invoice(invoice["id"])["L1"]
    assert l1_after.status.value == "Pending"
    assert l1_after.action_taken_by is None


def test_l4_approve_for_payment_sets_final_status(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAII1111I", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    client.post(f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers)

    l4_id = get_approvals_for_invoice(invoice["id"])["L4"].id
    finance_headers = login_as("finance@test.com")
    action = client.post(
        f"/api/v1/invoice-approvals/{l4_id}/action", json={"action": "Approve_For_Payment"}, headers=finance_headers
    )
    assert action.status_code == 200
    assert action.json()["status"] == "Completed"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "Approved_For_Payment"


def test_query_raised_pauses_and_preserves_level(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAJJ1111J", quantity="1000", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    client.post(f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers)

    deptmgr_headers = login_as("deptmanager@test.com")
    query = client.post(
        f"/api/v1/invoices/{invoice['id']}/queries", json={"query_text": "Please clarify rate"}, headers=deptmgr_headers
    )
    assert query.status_code == 201
    assert query.json()["raised_at_level"] == "L2"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "Query_Raised"

    l2_after = get_approvals_for_invoice(invoice["id"])["L2"]
    assert l2_after.status.value == "Query_Raised"
    assert l2_after.tat_paused is True


def test_query_response_re_enters_same_level(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAKK1111K", quantity="1000", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    client.post(f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers)

    deptmgr_headers = login_as("deptmanager@test.com")
    query = client.post(
        f"/api/v1/invoices/{invoice['id']}/queries", json={"query_text": "Please clarify"}, headers=deptmgr_headers
    ).json()

    respond = client.post(
        f"/api/v1/invoices/{invoice['id']}/queries/{query['id']}/respond",
        json={"vendor_response": "Here is the clarification"},
        headers=auth_header(ctx["token"]),
    )
    assert respond.status_code == 200
    assert respond.json()["status"] == "Responded"

    inv = client.get(f"/api/v1/invoices/{invoice['id']}", headers=accounts_headers).json()
    assert inv["status"] == "L2_Review"

    l2_after = get_approvals_for_invoice(invoice["id"])["L2"]
    assert l2_after.status.value == "Pending"
    assert l2_after.tat_paused is False


def test_query_response_blocked_for_wrong_vendor(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOALL1111L", quantity="1000", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    client.post(f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=accounts_headers)

    deptmgr_headers = login_as("deptmanager@test.com")
    query = client.post(
        f"/api/v1/invoices/{invoice['id']}/queries", json={"query_text": "Please clarify"}, headers=deptmgr_headers
    ).json()

    _, other_ctx = create_submitted_invoice(client, login_as, "DOAMM1111M", quantity="1", rate="1000.00")

    respond = client.post(
        f"/api/v1/invoices/{invoice['id']}/queries/{query['id']}/respond",
        json={"vendor_response": "Not my invoice"},
        headers=auth_header(other_ctx["token"]),
    )
    assert respond.status_code == 403


def test_resubmission_requires_fresh_routing(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOANN1111N", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action",
        json={"action": "Return_To_Vendor", "comments": "Fix documents"},
        headers=accounts_headers,
    )

    resubmit = client.post(f"/api/v1/invoices/{invoice['id']}/resubmit", headers=auth_header(ctx["token"]))
    assert resubmit.status_code == 200
    assert resubmit.json()["status"] == "Submitted"


def test_delegate_can_act_within_valid_dates(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAOO1111O", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    deptmgr_headers = login_as("deptmanager@test.com")
    deptmgr_me = client.get("/api/v1/users/me", headers=deptmgr_headers).json()

    delegation = client.post(
        "/api/v1/approval-delegations",
        json={
            "delegate_user_id": deptmgr_me["id"],
            "valid_from": (date.today() - timedelta(days=1)).isoformat(),
            "valid_to": (date.today() + timedelta(days=1)).isoformat(),
        },
        headers=accounts_headers,
    )
    assert delegation.status_code == 201

    action = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=deptmgr_headers
    )
    assert action.status_code == 200


def test_delegate_blocked_outside_valid_dates(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAPP1111P", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id

    accounts_headers = login_as("accounts@test.com")
    # Use partner@test.com as the delegate here (not deptmanager@test.com) — an earlier
    # test already granted deptmanager an active delegation from accounts@test.com that's
    # still valid today, which would otherwise mask this test's expired-dates case.
    partner_headers = login_as("partner@test.com")
    partner_me = client.get("/api/v1/users/me", headers=partner_headers).json()

    delegation = client.post(
        "/api/v1/approval-delegations",
        json={
            "delegate_user_id": partner_me["id"],
            "valid_from": (date.today() - timedelta(days=10)).isoformat(),
            "valid_to": (date.today() - timedelta(days=5)).isoformat(),
        },
        headers=accounts_headers,
    )
    assert delegation.status_code == 201

    action = client.post(
        f"/api/v1/invoice-approvals/{l1_id}/action", json={"action": "Verify"}, headers=partner_headers
    )
    assert action.status_code == 403


def test_escalations_endpoint_flags_breached_tat(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "DOAQQ1111Q", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])
    l1_id = get_approvals_for_invoice(invoice["id"])["L1"].id
    backdate_tat(l1_id)

    accounts_headers = login_as("accounts@test.com")
    resp = client.get("/api/v1/invoice-approvals/escalations", headers=accounts_headers)
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.json()]
    assert str(l1_id) in ids
