from tests.test_vendor_portal import auth_header, create_and_activate_vendor, full_vendor_login


def upload_document(client, token, vendor_id, document_type, filename="doc.pdf"):
    return client.post(
        "/api/v1/vendor-portal/kyc-documents",
        data={"vendor_id": vendor_id, "document_type": document_type},
        files={"file": (filename, b"dummy file content", "application/pdf")},
        headers=auth_header(token),
    )


def test_kyc_review_verified_updates_status(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "KKKKK1111K")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    upload = upload_document(client, token, vendor["vendor_id"], "PAN")
    assert upload.status_code == 201
    document_id = upload.json()["id"]
    assert upload.json()["status"] == "Pending_Review"

    accounts_headers = login_as("accounts@test.com")
    review = client.post(
        f"/api/v1/kyc-documents/{document_id}/review",
        json={"decision": "verify"},
        headers=accounts_headers,
    )
    assert review.status_code == 200
    assert review.json()["status"] == "Verified"


def test_kyc_review_rejected_requires_reason(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "KKKKK2222K")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    upload = upload_document(client, token, vendor["vendor_id"], "Bank_Proof")
    document_id = upload.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    review = client.post(
        f"/api/v1/kyc-documents/{document_id}/review",
        json={"decision": "reject"},
        headers=accounts_headers,
    )
    assert review.status_code == 422


def test_profile_status_incomplete_until_all_verified(client, login_as):
    gstin = "27MMMMM1111M1Z5"
    vendor = create_and_activate_vendor(
        client,
        login_as,
        "MMMMM1111M",
        request_overrides={"recommended_gstin": gstin},
    )
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    status_before = client.get("/api/v1/vendor-portal/profile/status", headers=auth_header(token))
    assert status_before.status_code == 200
    body_before = status_before.json()
    assert body_before["complete"] is False
    mandatory_types = body_before["mandatory_documents"]
    assert set(mandatory_types) == {"PAN", "Bank_Proof", "Beneficial_Ownership", "GST_Certificate"}

    accounts_headers = login_as("accounts@test.com")
    for doc_type in mandatory_types:
        upload = upload_document(client, token, vendor["vendor_id"], doc_type, filename=f"{doc_type}.pdf")
        assert upload.status_code == 201
        document_id = upload.json()["id"]
        review = client.post(
            f"/api/v1/kyc-documents/{document_id}/review",
            json={"decision": "verify"},
            headers=accounts_headers,
        )
        assert review.status_code == 200

    status_after = client.get("/api/v1/vendor-portal/profile/status", headers=auth_header(token))
    assert status_after.status_code == 200
    assert status_after.json()["complete"] is True
    assert status_after.json()["missing_or_unverified"] == []


def test_document_file_download_authorized_vs_forbidden(client, login_as):
    vendor_a = create_and_activate_vendor(client, login_as, "FFFFF1111F")
    vendor_b = create_and_activate_vendor(client, login_as, "FFFFF2222F")

    token_a = full_vendor_login(client, vendor_a["email"], vendor_a["temp_password"])
    token_b = full_vendor_login(client, vendor_b["email"], vendor_b["temp_password"])

    upload = upload_document(client, token_a, vendor_a["vendor_id"], "PAN")
    document_id = upload.json()["id"]

    # Owning vendor can download.
    own_download = client.get(f"/api/v1/kyc-documents/{document_id}/file", headers=auth_header(token_a))
    assert own_download.status_code == 200
    assert own_download.content == b"dummy file content"

    # A different vendor cannot.
    other_vendor_download = client.get(f"/api/v1/kyc-documents/{document_id}/file", headers=auth_header(token_b))
    assert other_vendor_download.status_code == 403

    # A reviewer can.
    accounts_headers = login_as("accounts@test.com")
    reviewer_download = client.get(f"/api/v1/kyc-documents/{document_id}/file", headers=accounts_headers)
    assert reviewer_download.status_code == 200
