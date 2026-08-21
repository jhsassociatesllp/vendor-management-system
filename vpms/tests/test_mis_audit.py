import csv
import io
from datetime import date, timedelta
from decimal import Decimal

from app.models.audit_log import AuditLog
from tests.conftest import TestingSessionLocal
from tests.test_invoice_approvals import create_submitted_invoice, route
from tests.test_kyc_documents import upload_document
from tests.test_payments import create_approved_invoice, make_payment_payload, set_invoice_payment_due_date
from tests.test_purchase_orders import make_po_payload, setup_po_prereqs
from tests.test_vendor_portal import create_and_activate_vendor, full_vendor_login
from tests.test_vendor_requests import create_request, make_request_payload


def test_audit_log_created_on_representative_write_action(client, login_as):
    created = create_request(client, login_as, "MISAA1111A")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    client.post(
        f"/api/v1/vendor-requests/{request_id}/accounts-review", json={"action": "advance"}, headers=accounts_headers
    )

    partner_headers = login_as("partner@test.com")
    approve = client.post(
        f"/api/v1/vendor-requests/{request_id}/partner-decision", json={"action": "approve"}, headers=partner_headers
    )
    assert approve.status_code == 200

    auditor_headers = login_as("auditor@test.com")
    logs = client.get(
        "/api/v1/audit-logs", params={"module": "VendorRequest", "action": "Approve"}, headers=auditor_headers
    ).json()
    assert any(l["record_reference"] == "Acme Supplies Pvt Ltd" for l in logs)


def test_audit_log_created_on_login_and_failed_login(client, login_as):
    client.post("/api/v1/auth/login", json={"email": "finance@test.com", "password": "wrong-password"})
    client.post("/api/v1/auth/login", json={"email": "finance@test.com", "password": "password123"})

    auditor_headers = login_as("auditor@test.com")
    logins = client.get("/api/v1/audit-logs", params={"action": "Login", "module": "Auth"}, headers=auditor_headers).json()
    assert any(l["record_reference"] == "finance@test.com" for l in logins)

    failed = client.get(
        "/api/v1/audit-logs", params={"action": "Login_Failed", "module": "Auth"}, headers=auditor_headers
    ).json()
    assert any(l["record_reference"] == "finance@test.com" for l in failed)


def test_audit_logs_have_no_update_or_delete_route(client, login_as):
    auditor_headers = login_as("auditor@test.com")
    logs = client.get("/api/v1/audit-logs", headers=auditor_headers).json()
    assert len(logs) > 0
    log_id = logs[0]["id"]

    assert client.patch(f"/api/v1/audit-logs/{log_id}", json={}, headers=auditor_headers).status_code in (404, 405)
    assert client.put(f"/api/v1/audit-logs/{log_id}", json={}, headers=auditor_headers).status_code in (404, 405)
    assert client.delete(f"/api/v1/audit-logs/{log_id}", headers=auditor_headers).status_code in (404, 405)


def test_hash_chain_integrity_passes_on_unmodified_data(client, login_as):
    auditor_headers = login_as("auditor@test.com")
    result = client.get("/api/v1/audit-logs/integrity-check", headers=auditor_headers).json()
    assert result["clean"] is True
    assert result["breaks"] == []


def test_hash_chain_integrity_detects_tampered_row(client, login_as):
    auditor_headers = login_as("auditor@test.com")
    client.post("/api/v1/auth/login", json={"email": "finance@test.com", "password": "password123"})

    db = TestingSessionLocal()
    try:
        row = db.query(AuditLog).order_by(AuditLog.sequence.asc()).first()
        row.record_reference = "TAMPERED-" + row.record_reference
        db.add(row)
        db.commit()
        tampered_id = str(row.id)
    finally:
        db.close()

    result = client.get("/api/v1/audit-logs/integrity-check", headers=auditor_headers).json()
    assert result["clean"] is False
    assert any(b["id"] == tampered_id for b in result["breaks"])


def test_field_level_changes_captured_on_update(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "MISBB1111B")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])
    upload = upload_document(client, token, vendor["vendor_id"], "PAN")
    assert upload.status_code == 201

    accounts_headers = login_as("accounts@test.com")
    review = client.post(
        f"/api/v1/kyc-documents/{upload.json()['id']}/review", json={"decision": "verify"}, headers=accounts_headers
    )
    assert review.status_code == 200

    auditor_headers = login_as("auditor@test.com")
    logs = client.get(
        "/api/v1/audit-logs", params={"module": "KycDocument", "action": "Approve"}, headers=auditor_headers
    ).json()
    matching = [l for l in logs if vendor["vendor_id"] in l["record_reference"]]
    assert matching
    changes = matching[0]["field_changes"]
    status_change = next(c for c in changes if c["field"] == "status")
    assert status_change["old_value"] == "Pending_Review"
    assert status_change["new_value"] == "Verified"


def test_dashboard_summary_kpis_correct_against_seeded_data(client, login_as):
    admin_headers = login_as("admin@test.com")
    before = client.get("/api/v1/mis/dashboard/summary", headers=admin_headers).json()

    invoice, ctx = create_approved_invoice(client, login_as, "MISCC1111C", quantity="1", rate="1000.00")
    set_invoice_payment_due_date(invoice["id"], date.today() - timedelta(days=5))

    after = client.get("/api/v1/mis/dashboard/summary", headers=admin_headers).json()
    assert after["overdue_invoice_count"] == before["overdue_invoice_count"] + 1
    assert after["total_payables"] > before["total_payables"]


def test_aging_buckets_correct(client, login_as):
    admin_headers = login_as("admin@test.com")
    before = {b["bucket"]: b["count"] for b in client.get("/api/v1/mis/dashboard/aging", headers=admin_headers).json()}

    invoice, ctx = create_approved_invoice(client, login_as, "MISDD1111D", quantity="1", rate="1000.00")
    set_invoice_payment_due_date(invoice["id"], date.today() - timedelta(days=45))

    after = {b["bucket"]: b["count"] for b in client.get("/api/v1/mis/dashboard/aging", headers=admin_headers).json()}
    assert after["30-60"] == before["30-60"] + 1


def test_vendor_master_report_fields_correct(client, login_as, existing_vendor_id):
    accounts_headers = login_as("accounts@test.com")
    rows = client.get(
        "/api/v1/reports/vendor-master", params={"vendor_id": existing_vendor_id}, headers=accounts_headers
    ).json()
    assert len(rows) == 1
    row = rows[0]
    assert row["vendor_code"] == "VND-2000-9999"
    assert row["tds_section"] == "194C"
    assert row["msme_status"] is False


def test_pending_invoices_report_shows_current_stage_and_days(client, login_as):
    invoice, ctx = create_submitted_invoice(client, login_as, "MISEE1111E", quantity="1", rate="1000.00")
    route(client, login_as, invoice["id"])

    accounts_headers = login_as("accounts@test.com")
    rows = client.get("/api/v1/reports/pending-invoices", headers=accounts_headers).json()
    match = next(r for r in rows if r["invoice_number"] == invoice["invoice_number"])
    assert match["current_stage"] == "L1"
    assert match["days_pending"] >= 0


def test_payment_register_matches_recorded_payments(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "MISFF1111F", quantity="1", rate="1000.00")
    finance_headers = login_as("finance@test.com")
    finance2_headers = login_as("finance2@test.com")

    payment = client.post(
        "/api/v1/payments", json=make_payment_payload(invoice["id"], utr_reference="UTRMIS0001"), headers=finance_headers
    ).json()
    confirm = client.post(f"/api/v1/payments/{payment['id']}/confirm", headers=finance2_headers)
    assert confirm.status_code == 200

    rows = client.get("/api/v1/reports/payment-register", headers=finance_headers).json()
    match = next(r for r in rows if r["utr_reference"] == "UTRMIS0001")
    assert Decimal(str(match["net_paid"])) == Decimal(payment["net_payable_amount"])


def test_tds_summary_aggregates_correctly(client, login_as):
    invoice, ctx = create_approved_invoice(client, login_as, "MISGG1111G", quantity="1", rate="1000.00")
    finance_headers = login_as("finance@test.com")
    finance2_headers = login_as("finance2@test.com")

    payment = client.post(
        "/api/v1/payments", json=make_payment_payload(invoice["id"], utr_reference="UTRMIS0002"), headers=finance_headers
    ).json()
    client.post(f"/api/v1/payments/{payment['id']}/confirm", headers=finance2_headers)

    vendor = client.get(f"/api/v1/vendors/{invoice['vendor_id']}", headers=finance_headers).json()

    rows = client.get("/api/v1/reports/tds-summary", headers=finance_headers).json()
    match = next(r for r in rows if r["vendor_name"] == vendor["vendor_name"] and r["tds_section"] == payment["tds_section"])
    assert Decimal(str(match["tds_amount"])) >= Decimal(payment["tds_amount"])


def test_budget_utilisation_report_matches_commitments(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, rate_card, budget_head = setup_po_prereqs(
        client, login_as, existing_vendor_id, existing_item_code_id, sanctioned_amount="500000.00"
    )

    payload = make_po_payload(existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"], quantity="10")
    po = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers).json()
    budget_headers = login_as("budgetcontroller@test.com")
    approve = client.post(f"/api/v1/purchase-orders/{po['id']}/approve", headers=budget_headers)
    assert approve.status_code == 200

    rows = client.get(
        "/api/v1/reports/budget-utilisation", params={"department": budget_head["department"]}, headers=budget_headers
    ).json()
    match = next(r for r in rows if r["cost_centre"] == budget_head["cost_centre"])
    assert Decimal(str(match["committed"])) >= Decimal(po["total_po_value_incl_gst"])


def test_csv_export_matches_json_dataset_for_same_filters(client, login_as, existing_vendor_id):
    accounts_headers = login_as("accounts@test.com")
    json_rows = client.get(
        "/api/v1/reports/vendor-master", params={"vendor_id": existing_vendor_id}, headers=accounts_headers
    ).json()
    csv_resp = client.get(
        "/api/v1/reports/vendor-master", params={"vendor_id": existing_vendor_id, "format": "csv"}, headers=accounts_headers
    )
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")

    csv_rows = list(csv.DictReader(io.StringIO(csv_resp.text)))
    assert len(csv_rows) == len(json_rows)
    assert sorted(r["vendor_code"] for r in csv_rows) == sorted(r["vendor_code"] for r in json_rows)


def test_auditor_role_blocked_from_all_write_endpoints_across_app(client, login_as):
    auditor_headers = login_as("auditor@test.com")

    r1 = client.post(
        "/api/v1/item-codes",
        json={"category": "X", "sub_category": "Y", "description": "Z", "unit": "pc", "default_rate": "1.00"},
        headers=auditor_headers,
    )
    assert r1.status_code == 403

    r2 = client.post(
        "/api/v1/budget-heads",
        json={"department": "X", "cost_centre": "Y", "period_type": "Annual", "period_label": "FY26", "sanctioned_amount": "1000.00"},
        headers=auditor_headers,
    )
    assert r2.status_code == 403

    r3 = client.post("/api/v1/vendor-requests", json=make_request_payload("MISHH1111H"), headers=auditor_headers)
    assert r3.status_code == 403

    r4 = client.post(
        "/api/v1/doa-matrix",
        json={"min_amount": "0", "max_amount": "100", "requires_l2": False, "requires_l3": False, "l4_role": "Finance Team"},
        headers=auditor_headers,
    )
    assert r4.status_code == 403
