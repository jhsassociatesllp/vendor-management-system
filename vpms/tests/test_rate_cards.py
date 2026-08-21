from tests.test_agreements import make_agreement_payload


def create_agreement(client, headers, vendor_id, item_code_ids, **overrides):
    payload = make_agreement_payload(vendor_id, item_code_ids, **overrides)
    response = client.post("/api/v1/agreements", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


def create_item_code(client, headers, description):
    response = client.post(
        "/api/v1/item-codes",
        json={
            "category": "Misc",
            "sub_category": "Misc",
            "description": description,
            "unit": "unit",
            "default_rate": "10.00",
        },
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


def make_rate_card_payload(item_code_id, **overrides):
    payload = {
        "item_code_id": item_code_id,
        "pricing_type": "Fixed",
        "rate": "5000.00",
        "effective_from": "2026-02-01",
        "effective_to": None,
    }
    payload.update(overrides)
    return payload


def test_rate_card_item_must_be_covered(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    agreement = create_agreement(client, headers, existing_vendor_id, [existing_item_code_id])
    uncovered_item_id = create_item_code(client, headers, "Uncovered item for rate card test")

    payload = make_rate_card_payload(uncovered_item_id)
    response = client.post(f"/api/v1/agreements/{agreement['id']}/rate-cards", json=payload, headers=headers)
    assert response.status_code == 400


def test_rate_card_dates_must_be_within_agreement(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    agreement = create_agreement(client, headers, existing_vendor_id, [existing_item_code_id])

    payload = make_rate_card_payload(existing_item_code_id, effective_from="2025-01-01")
    response = client.post(f"/api/v1/agreements/{agreement['id']}/rate-cards", json=payload, headers=headers)
    assert response.status_code == 400


def test_milestone_total_cannot_exceed_100_percent(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    agreement = create_agreement(
        client, headers, existing_vendor_id, [existing_item_code_id], billing_frequency="Milestone"
    )

    first = client.post(
        f"/api/v1/agreements/{agreement['id']}/milestones",
        json={
            "description": "Phase 1",
            "percentage_of_contract_value": "60.00",
            "expected_date": "2026-03-01",
            "deliverables": "Design docs",
        },
        headers=headers,
    )
    assert first.status_code == 201

    second = client.post(
        f"/api/v1/agreements/{agreement['id']}/milestones",
        json={
            "description": "Phase 2",
            "percentage_of_contract_value": "50.00",
            "expected_date": "2026-06-01",
            "deliverables": "Final delivery",
        },
        headers=headers,
    )
    assert second.status_code == 400


def test_tds_override_requires_reason(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    payload = make_agreement_payload(
        existing_vendor_id,
        [existing_item_code_id],
        tds_section="194J",
        tds_override_reason=None,
    )
    response = client.post("/api/v1/agreements", json=payload, headers=headers)
    assert response.status_code == 422


def test_rate_card_blocked_after_termination(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    agreement = create_agreement(client, headers, existing_vendor_id, [existing_item_code_id])

    terminate = client.post(f"/api/v1/agreements/{agreement['id']}/terminate", headers=headers)
    assert terminate.status_code == 200
    assert terminate.json()["status"] == "Terminated"

    payload = make_rate_card_payload(existing_item_code_id)
    response = client.post(f"/api/v1/agreements/{agreement['id']}/rate-cards", json=payload, headers=headers)
    assert response.status_code == 400
