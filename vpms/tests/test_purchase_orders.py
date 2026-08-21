import re
import uuid
from datetime import date
from decimal import Decimal

from tests.test_amendments import create_agreement_with_rate_card
from tests.test_vendor_portal import auth_header, full_vendor_login
from tests.test_vendors import create_approved_request, make_vendor_payload

PO_NUMBER_PATTERN = re.compile(r"^PO-\d{4}-\d{4}$")

_budget_head_counter = 0


def ensure_active_combo(client, headers, vendor_id, item_code_id):
    resp = client.post(
        f"/api/v1/vendors/{vendor_id}/item-codes",
        json={"item_code_ids": [item_code_id]},
        headers=headers,
    )
    assert resp.status_code in (201, 409)


def create_budget_head(client, headers, sanctioned_amount="100000.00", **overrides):
    global _budget_head_counter
    _budget_head_counter += 1
    payload = {
        "department": "Operations",
        "cost_centre": "CC-100",
        "period_type": "Annual",
        "period_label": f"FY2026-TEST-{_budget_head_counter}",
        "sanctioned_amount": sanctioned_amount,
    }
    payload.update(overrides)
    resp = client.post("/api/v1/budget-heads", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


def make_po_payload(vendor_id, item_code_id, agreement_id, budget_head_id, **overrides):
    payload = {
        "vendor_id": vendor_id,
        "item_code_id": item_code_id,
        "agreement_id": agreement_id,
        "description": "Test PO",
        "quantity": "10",
        "budget_head_id": budget_head_id,
        "delivery_completion_date": "2026-09-01",
        "po_validity_date": "2026-12-31",
    }
    payload.update(overrides)
    return payload


def setup_po_prereqs(client, login_as, existing_vendor_id, existing_item_code_id, sanctioned_amount="100000.00"):
    accounts_headers = login_as("accounts@test.com")
    budget_headers = login_as("budgetcontroller@test.com")

    ensure_active_combo(client, accounts_headers, existing_vendor_id, existing_item_code_id)
    agreement, rate_card = create_agreement_with_rate_card(
        client, accounts_headers, existing_vendor_id, existing_item_code_id
    )
    budget_head = create_budget_head(client, budget_headers, sanctioned_amount=sanctioned_amount)
    return agreement, rate_card, budget_head


def test_po_blocked_without_active_vendor_item_combo(client, login_as, second_vendor_id, existing_item_code_id):
    headers = login_as("deptmanager@test.com")
    payload = make_po_payload(second_vendor_id, existing_item_code_id, str(uuid.uuid4()), str(uuid.uuid4()))
    response = client.post("/api/v1/purchase-orders", json=payload, headers=headers)
    assert response.status_code == 400


def test_po_blocked_without_active_agreement(client, login_as, existing_vendor_id, existing_item_code_id):
    accounts_headers = login_as("accounts@test.com")
    deptmgr_headers = login_as("deptmanager@test.com")
    ensure_active_combo(client, accounts_headers, existing_vendor_id, existing_item_code_id)

    payload = make_po_payload(existing_vendor_id, existing_item_code_id, str(uuid.uuid4()), str(uuid.uuid4()))
    response = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers)
    assert response.status_code == 400


def test_po_blocked_when_budget_insufficient(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, _, budget_head = setup_po_prereqs(
        client, login_as, existing_vendor_id, existing_item_code_id, sanctioned_amount="1000.00"
    )

    payload = make_po_payload(existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"])
    response = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers)
    assert response.status_code == 400


def test_po_over_budget_exception_still_requires_approval(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, _, budget_head = setup_po_prereqs(
        client, login_as, existing_vendor_id, existing_item_code_id, sanctioned_amount="100.00"
    )

    payload = make_po_payload(
        existing_vendor_id,
        existing_item_code_id,
        agreement["id"],
        budget_head["id"],
        over_budget_justification="Urgent business need, verbally cleared",
    )
    response = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers)
    assert response.status_code == 201
    assert response.json()["status"] == "Pending_Approval"


def test_po_number_format(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, _, budget_head = setup_po_prereqs(client, login_as, existing_vendor_id, existing_item_code_id)

    payload = make_po_payload(existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"])
    response = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers)
    assert response.status_code == 201
    assert PO_NUMBER_PATTERN.match(response.json()["po_number"])


def test_po_date_always_system_date(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, _, budget_head = setup_po_prereqs(client, login_as, existing_vendor_id, existing_item_code_id)

    payload = make_po_payload(existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"])
    payload["po_date"] = "2020-01-01"
    response = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers)
    assert response.status_code == 201
    assert response.json()["po_date"] == date.today().isoformat()


def test_po_rate_override_requires_reason(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, rate_card, budget_head = setup_po_prereqs(client, login_as, existing_vendor_id, existing_item_code_id)

    different_rate = str(Decimal(rate_card["rate"]) + 1000)
    payload = make_po_payload(
        existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"], rate=different_rate
    )
    response = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers)
    assert response.status_code == 422


def test_po_totals_are_server_computed(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, rate_card, budget_head = setup_po_prereqs(client, login_as, existing_vendor_id, existing_item_code_id)

    payload = make_po_payload(
        existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"], quantity="10"
    )
    payload["po_value_excl_gst"] = "1.00"
    payload["gst_amount"] = "1.00"
    payload["total_po_value_incl_gst"] = "1.00"
    response = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers)
    assert response.status_code == 201
    body = response.json()

    expected_excl_gst = Decimal("10") * Decimal(rate_card["rate"])
    expected_gst = expected_excl_gst * Decimal("18") / Decimal("100")
    assert Decimal(body["po_value_excl_gst"]) == expected_excl_gst
    assert Decimal(body["gst_amount"]) == expected_gst
    assert Decimal(body["total_po_value_incl_gst"]) == expected_excl_gst + expected_gst


def test_po_approval_commits_budget(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    budget_headers = login_as("budgetcontroller@test.com")
    agreement, _, budget_head = setup_po_prereqs(
        client, login_as, existing_vendor_id, existing_item_code_id, sanctioned_amount="100000.00"
    )

    payload = make_po_payload(existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"])
    po = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers).json()

    approve = client.post(f"/api/v1/purchase-orders/{po['id']}/approve", headers=budget_headers)
    assert approve.status_code == 200
    assert approve.json()["status"] == "Approved"

    availability = client.get(f"/api/v1/budget-heads/{budget_head['id']}/availability", headers=budget_headers).json()
    assert Decimal(availability["available_amount"]) == Decimal("100000.00") - Decimal(po["total_po_value_incl_gst"])


def test_po_cancellation_releases_budget(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    budget_headers = login_as("budgetcontroller@test.com")
    accounts_headers = login_as("accounts@test.com")
    agreement, _, budget_head = setup_po_prereqs(
        client, login_as, existing_vendor_id, existing_item_code_id, sanctioned_amount="100000.00"
    )

    payload = make_po_payload(existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"])
    po = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers).json()
    client.post(f"/api/v1/purchase-orders/{po['id']}/approve", headers=budget_headers)

    cancel = client.post(f"/api/v1/purchase-orders/{po['id']}/cancel", headers=accounts_headers)
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "Cancelled"

    availability = client.get(f"/api/v1/budget-heads/{budget_head['id']}/availability", headers=budget_headers).json()
    assert Decimal(availability["available_amount"]) == Decimal("100000.00")


def test_po_amendment_requires_fresh_approval(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    budget_headers = login_as("budgetcontroller@test.com")
    agreement, _, budget_head = setup_po_prereqs(
        client, login_as, existing_vendor_id, existing_item_code_id, sanctioned_amount="500000.00"
    )

    payload = make_po_payload(
        existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"], quantity="10"
    )
    po = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers).json()
    assert po["version"] == 1

    approve = client.post(f"/api/v1/purchase-orders/{po['id']}/approve", headers=budget_headers)
    assert approve.json()["status"] == "Approved"

    amend_payload = {
        "new_quantity": "20",
        "new_rate": po["rate"],
        "new_delivery_date": "2026-10-01",
        "reason": "Scope increased",
    }
    amendment = client.post(
        f"/api/v1/purchase-orders/{po['id']}/amend", json=amend_payload, headers=deptmgr_headers
    ).json()
    assert amendment["status"] == "Pending_Approval"

    approve_amend = client.post(f"/api/v1/po-amendments/{amendment['id']}/approve", headers=budget_headers)
    assert approve_amend.status_code == 200
    assert approve_amend.json()["status"] == "Approved"

    updated_po = client.get(f"/api/v1/purchase-orders/{po['id']}", headers=deptmgr_headers).json()
    assert updated_po["version"] == 2
    assert Decimal(updated_po["quantity"]) == Decimal("20")
    assert updated_po["status"] == "Pending_Approval"


def test_grn_cumulative_cannot_exceed_po_quantity(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, _, budget_head = setup_po_prereqs(client, login_as, existing_vendor_id, existing_item_code_id)

    payload = make_po_payload(
        existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"], quantity="10"
    )
    po = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers).json()

    grn_payload = {"type": "GRN", "quantity_confirmed": "11", "description": "Full delivery attempt"}
    response = client.post(f"/api/v1/purchase-orders/{po['id']}/grn", json=grn_payload, headers=deptmgr_headers)
    assert response.status_code == 400


def test_partial_grn_supported(client, login_as, existing_vendor_id, existing_item_code_id):
    deptmgr_headers = login_as("deptmanager@test.com")
    agreement, _, budget_head = setup_po_prereqs(client, login_as, existing_vendor_id, existing_item_code_id)

    payload = make_po_payload(
        existing_vendor_id, existing_item_code_id, agreement["id"], budget_head["id"], quantity="10"
    )
    po = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers).json()

    first = client.post(
        f"/api/v1/purchase-orders/{po['id']}/grn",
        json={"type": "GRN", "quantity_confirmed": "4", "description": "First batch"},
        headers=deptmgr_headers,
    )
    assert first.status_code == 201

    second = client.post(
        f"/api/v1/purchase-orders/{po['id']}/grn",
        json={"type": "GRN", "quantity_confirmed": "6", "description": "Second batch"},
        headers=deptmgr_headers,
    )
    assert second.status_code == 201

    third = client.post(
        f"/api/v1/purchase-orders/{po['id']}/grn",
        json={"type": "GRN", "quantity_confirmed": "1", "description": "Should exceed"},
        headers=deptmgr_headers,
    )
    assert third.status_code == 400

    entries = client.get(f"/api/v1/purchase-orders/{po['id']}/grn", headers=deptmgr_headers).json()
    assert len(entries) == 2
    assert sum(Decimal(e["quantity_confirmed"]) for e in entries) == Decimal("10")


def test_vendor_acknowledge_blocked_for_other_vendor(client, login_as):
    accounts_headers = login_as("accounts@test.com")
    budget_headers = login_as("budgetcontroller@test.com")
    deptmgr_headers = login_as("deptmanager@test.com")

    vendor_a_request = create_approved_request(client, login_as, "AAAPO1111P")
    vendor_a_resp = client.post(
        f"/api/v1/vendors/from-request/{vendor_a_request}",
        json=make_vendor_payload(email="vendor-a-po@test.com"),
        headers=accounts_headers,
    )
    vendor_a = vendor_a_resp.json()

    item_code_resp = client.post(
        "/api/v1/item-codes",
        json={
            "category": "PO Test",
            "sub_category": "Widgets",
            "description": "Widget for PO vendor-ack test",
            "unit": "piece",
            "default_rate": "100.00",
        },
        headers=accounts_headers,
    )
    item_code_id = item_code_resp.json()["id"]

    vendor_a_activation = client.post(
        f"/api/v1/vendor-portal/activate/{vendor_a['id']}", headers=accounts_headers
    ).json()

    ensure_active_combo(client, accounts_headers, vendor_a["id"], item_code_id)
    agreement, _ = create_agreement_with_rate_card(client, accounts_headers, vendor_a["id"], item_code_id)
    budget_head = create_budget_head(client, budget_headers)

    payload = make_po_payload(vendor_a["id"], item_code_id, agreement["id"], budget_head["id"])
    po = client.post("/api/v1/purchase-orders", json=payload, headers=deptmgr_headers).json()
    client.post(f"/api/v1/purchase-orders/{po['id']}/approve", headers=budget_headers)

    vendor_b_request = create_approved_request(client, login_as, "AAAPO2222P")
    vendor_b_resp = client.post(
        f"/api/v1/vendors/from-request/{vendor_b_request}",
        json=make_vendor_payload(email="vendor-b-po@test.com", mobile_number="9123456790"),
        headers=accounts_headers,
    )
    vendor_b = vendor_b_resp.json()
    vendor_b_activation = client.post(
        f"/api/v1/vendor-portal/activate/{vendor_b['id']}", headers=accounts_headers
    ).json()

    vendor_b_token = full_vendor_login(client, vendor_b_activation["email"], vendor_b_activation["temp_password"])

    response = client.post(
        f"/api/v1/purchase-orders/{po['id']}/vendor-acknowledge", headers=auth_header(vendor_b_token)
    )
    assert response.status_code == 403

    vendor_a_token = full_vendor_login(client, vendor_a_activation["email"], vendor_a_activation["temp_password"])
    own_ack = client.post(
        f"/api/v1/purchase-orders/{po['id']}/vendor-acknowledge", headers=auth_header(vendor_a_token)
    )
    assert own_ack.status_code == 200
    assert own_ack.json()["status"] == "Vendor_Acknowledged"
