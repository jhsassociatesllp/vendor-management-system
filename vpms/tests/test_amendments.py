from tests.test_agreements import make_agreement_payload


def create_agreement_with_rate_card(client, headers, vendor_id, item_code_id, rate="5000.00"):
    agreement_payload = make_agreement_payload(vendor_id, [item_code_id])
    agreement_resp = client.post("/api/v1/agreements", json=agreement_payload, headers=headers)
    assert agreement_resp.status_code == 201
    agreement = agreement_resp.json()

    rate_card_resp = client.post(
        f"/api/v1/agreements/{agreement['id']}/rate-cards",
        json={
            "item_code_id": item_code_id,
            "pricing_type": "Fixed",
            "rate": rate,
            "effective_from": "2026-02-01",
            "effective_to": None,
        },
        headers=headers,
    )
    assert rate_card_resp.status_code == 201
    return agreement, rate_card_resp.json()


def test_amendment_proposal_creates_pending(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    agreement, rate_card = create_agreement_with_rate_card(client, headers, existing_vendor_id, existing_item_code_id)

    response = client.post(
        f"/api/v1/rate-cards/{rate_card['id']}/amendments",
        json={"proposed_rate": "6000.00", "reason": "Market rate increase"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["status"] == "Pending"

    rate_cards = client.get(
        f"/api/v1/agreements/{agreement['id']}/rate-cards", headers=headers
    ).json()
    original = next(rc for rc in rate_cards if rc["id"] == rate_card["id"])
    assert original["is_active"] is True
    assert original["rate"] == "5000.00"
    assert original["effective_to"] is None


def test_amendment_approval_activates_new_rate(client, login_as, existing_vendor_id, existing_item_code_id):
    accounts_headers = login_as("accounts@test.com")
    agreement, rate_card = create_agreement_with_rate_card(
        client, accounts_headers, existing_vendor_id, existing_item_code_id
    )

    proposal = client.post(
        f"/api/v1/rate-cards/{rate_card['id']}/amendments",
        json={"proposed_rate": "7500.00", "reason": "Renegotiated rate"},
        headers=accounts_headers,
    )
    amendment_id = proposal.json()["id"]

    partner_headers = login_as("partner@test.com")
    approval = client.post(f"/api/v1/rate-card-amendments/{amendment_id}/approve", headers=partner_headers)
    assert approval.status_code == 200
    assert approval.json()["status"] == "Approved"

    rate_cards = client.get(f"/api/v1/agreements/{agreement['id']}/rate-cards", headers=accounts_headers).json()
    old_card = next(rc for rc in rate_cards if rc["id"] == rate_card["id"])
    assert old_card["is_active"] is False
    assert old_card["effective_to"] is not None

    new_cards = [rc for rc in rate_cards if rc["id"] != rate_card["id"]]
    assert len(new_cards) == 1
    assert new_cards[0]["is_active"] is True
    assert new_cards[0]["rate"] == "7500.00"


def test_amendment_self_approval_blocked(client, login_as, existing_vendor_id, existing_item_code_id):
    admin_headers = login_as("admin@test.com")
    _, rate_card = create_agreement_with_rate_card(client, admin_headers, existing_vendor_id, existing_item_code_id)

    proposal = client.post(
        f"/api/v1/rate-cards/{rate_card['id']}/amendments",
        json={"proposed_rate": "8000.00", "reason": "Self approval test"},
        headers=admin_headers,
    )
    amendment_id = proposal.json()["id"]

    response = client.post(f"/api/v1/rate-card-amendments/{amendment_id}/approve", headers=admin_headers)
    assert response.status_code == 403


def test_amendment_approval_blocked_for_accounts_executive(
    client, login_as, existing_vendor_id, existing_item_code_id
):
    accounts_headers = login_as("accounts@test.com")
    _, rate_card = create_agreement_with_rate_card(
        client, accounts_headers, existing_vendor_id, existing_item_code_id
    )

    proposal = client.post(
        f"/api/v1/rate-cards/{rate_card['id']}/amendments",
        json={"proposed_rate": "9000.00", "reason": "Accounts exec cannot approve"},
        headers=accounts_headers,
    )
    amendment_id = proposal.json()["id"]

    response = client.post(f"/api/v1/rate-card-amendments/{amendment_id}/approve", headers=accounts_headers)
    assert response.status_code == 403
