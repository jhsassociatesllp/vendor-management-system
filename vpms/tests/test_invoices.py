from datetime import date, timedelta
from decimal import Decimal

from tests.test_amendments import create_agreement_with_rate_card
from tests.test_purchase_orders import create_budget_head, ensure_active_combo, make_po_payload
from tests.test_vendor_portal import auth_header, create_and_activate_vendor, full_vendor_login

GST_RATE = Decimal("18")
MANDATORY_INVOICE_DOC_TYPES = ["Invoice_PDF", "GRN_SCN_Ack", "Work_Completion_Proof"]

_item_code_counter = 0


def create_item_code(client, headers, **overrides):
    global _item_code_counter
    _item_code_counter += 1
    payload = {
        "category": "Invoice Test",
        "sub_category": f"Widgets-{_item_code_counter}",
        "description": "Invoice test widget",
        "unit": "piece",
        "default_rate": "1000.00",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/item-codes", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


def complete_kyc(client, accounts_headers, token, vendor_id):
    status = client.get("/api/v1/vendor-portal/profile/status", headers=auth_header(token)).json()
    for doc_type in status["mandatory_documents"]:
        upload = client.post(
            "/api/v1/vendor-portal/kyc-documents",
            data={"vendor_id": vendor_id, "document_type": doc_type},
            files={"file": (f"{doc_type}.pdf", b"dummy content", "application/pdf")},
            headers=auth_header(token),
        )
        assert upload.status_code == 201
        document_id = upload.json()["id"]
        review = client.post(
            f"/api/v1/kyc-documents/{document_id}/review", json={"decision": "verify"}, headers=accounts_headers
        )
        assert review.status_code == 200


def setup_po_ready_invoice_context(
    client,
    login_as,
    pan,
    gstin="AUTO",
    msme_status=False,
    annual_spend="500000.00",
    vendor_category="Service",
    rate_card_rate="1000.00",
    po_quantity="10",
    grn_quantity="10",
    po_overrides=None,
    skip_kyc=False,
    skip_ack=False,
    skip_grn=False,
):
    # Each vendor request needs a distinct PAN *and* GSTIN — the dedup check treats a
    # collision on either as "vendor already exists". Deriving the GSTIN from the PAN
    # (state code + PAN + entity code + Z + checksum, matching GSTIN_PATTERN) keeps every
    # test vendor's GSTIN unique without a separate counter.
    if gstin == "AUTO":
        gstin = f"27{pan}1Z5"

    accounts_headers = login_as("accounts@test.com")
    budget_headers = login_as("budgetcontroller@test.com")
    deptmgr_headers = login_as("deptmanager@test.com")

    vendor_overrides = {
        "vendor_category": vendor_category,
        "msme_status": msme_status,
        "email": f"vendor-{pan.lower()}@test.com",
    }
    if msme_status:
        vendor_overrides["udyam_number"] = f"UDYAM-{pan}"

    vendor = create_and_activate_vendor(
        client,
        login_as,
        pan,
        request_overrides={"recommended_gstin": gstin, "estimated_annual_spend": annual_spend},
        vendor_overrides=vendor_overrides,
    )
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    if not skip_kyc:
        complete_kyc(client, accounts_headers, token, vendor["vendor_id"])

    item_code_id = create_item_code(client, accounts_headers)
    ensure_active_combo(client, accounts_headers, vendor["vendor_id"], item_code_id)
    agreement, rate_card = create_agreement_with_rate_card(
        client, accounts_headers, vendor["vendor_id"], item_code_id, rate=rate_card_rate
    )
    budget_head = create_budget_head(client, budget_headers, sanctioned_amount="10000000.00")

    po_payload = make_po_payload(
        vendor["vendor_id"], item_code_id, agreement["id"], budget_head["id"], quantity=po_quantity, **(po_overrides or {})
    )
    po = client.post("/api/v1/purchase-orders", json=po_payload, headers=deptmgr_headers).json()
    approve = client.post(f"/api/v1/purchase-orders/{po['id']}/approve", headers=budget_headers)
    assert approve.status_code == 200

    if not skip_ack:
        ack = client.post(f"/api/v1/purchase-orders/{po['id']}/vendor-acknowledge", headers=auth_header(token))
        assert ack.status_code == 200

    if not skip_grn:
        grn = client.post(
            f"/api/v1/purchase-orders/{po['id']}/grn",
            json={"type": "GRN", "quantity_confirmed": grn_quantity, "description": "Delivered"},
            headers=deptmgr_headers,
        )
        assert grn.status_code == 201

    return {
        "vendor": vendor,
        "token": token,
        "item_code_id": item_code_id,
        "agreement": agreement,
        "rate_card": rate_card,
        "budget_head": budget_head,
        "po": po,
        "accounts_headers": accounts_headers,
        "deptmgr_headers": deptmgr_headers,
    }


def make_invoice_payload(po_id, agreement_id, item_code_id, invoice_number, quantity="5", rate="1000.00", **overrides):
    quantity_d = Decimal(quantity)
    rate_d = Decimal(rate)
    taxable = quantity_d * rate_d
    gst = (taxable * GST_RATE / Decimal(100)).quantize(Decimal("0.01"))
    cgst = (gst / 2).quantize(Decimal("0.01"))
    sgst = gst - cgst
    igst = Decimal("0")
    total = taxable + gst

    payload = {
        "invoice_number": invoice_number,
        "po_id": po_id,
        "agreement_id": agreement_id,
        "item_code_id": item_code_id,
        "invoice_date": date.today().isoformat(),
        "quantity": str(quantity_d),
        "rate": str(rate_d),
        "cgst_amount": str(cgst),
        "sgst_amount": str(sgst),
        "igst_amount": str(igst),
        "total_invoice_amount": str(total),
        "period_service_from": "2026-01-15",
        "period_service_to": "2026-01-20",
        "billing_milestone_id": None,
        "work_description": "Test invoice work",
    }
    payload.update(overrides)
    return payload


def upload_invoice_doc(client, token, invoice_id, document_type, filename="doc.pdf"):
    return client.post(
        f"/api/v1/invoices/{invoice_id}/documents",
        data={"document_type": document_type},
        files={"file": (filename, b"dummy content", "application/pdf")},
        headers=auth_header(token),
    )


def upload_all_mandatory_invoice_docs(client, token, invoice_id):
    for doc_type in MANDATORY_INVOICE_DOC_TYPES:
        resp = upload_invoice_doc(client, token, invoice_id, doc_type, filename=f"{doc_type}.pdf")
        assert resp.status_code == 201


def create_invoice(client, token, payload):
    return client.post("/api/v1/invoices", json=payload, headers=auth_header(token))


def test_duplicate_invoice_number_same_vendor_blocked(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVAA1111A")
    token = ctx["token"]
    po, agreement, item_code_id = ctx["po"], ctx["agreement"], ctx["item_code_id"]

    payload1 = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-DUP-1", quantity="2")
    inv1 = create_invoice(client, token, payload1).json()
    upload_all_mandatory_invoice_docs(client, token, inv1["id"])
    submit1 = client.post(f"/api/v1/invoices/{inv1['id']}/submit", headers=auth_header(token))
    assert submit1.status_code == 200
    assert submit1.json()["status"] == "Submitted"

    payload2 = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-DUP-1", quantity="2")
    inv2 = create_invoice(client, token, payload2).json()
    upload_all_mandatory_invoice_docs(client, token, inv2["id"])
    submit2 = client.post(f"/api/v1/invoices/{inv2['id']}/submit", headers=auth_header(token))
    assert submit2.status_code == 422
    assert "Duplicate" in submit2.json()["detail"]


def test_duplicate_invoice_number_different_vendor_allowed(client, login_as):
    ctx_a = setup_po_ready_invoice_context(client, login_as, "INVBB1111B")
    ctx_b = setup_po_ready_invoice_context(client, login_as, "INVBB2222B")

    for ctx in (ctx_a, ctx_b):
        payload = make_invoice_payload(ctx["po"]["id"], ctx["agreement"]["id"], ctx["item_code_id"], "INV-SHARED-1", quantity="2")
        inv = create_invoice(client, ctx["token"], payload).json()
        upload_all_mandatory_invoice_docs(client, ctx["token"], inv["id"])
        submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(ctx["token"]))
        assert submit.status_code == 200
        assert submit.json()["status"] == "Submitted"


def test_invoice_amount_exceeding_po_balance_blocked(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVCC1111C", po_quantity="10", grn_quantity="10")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    # quantity stays within GRN-available (10), but an inflated rate blows the total past
    # the PO's committed value (10 * 1000 excl GST = 10000, incl GST = 11800).
    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-OVERBAL-1", quantity="5", rate="5000.00")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "PO balance" in submit.json()["detail"]


def test_invoice_quantity_exceeding_grn_available_blocked(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVDD1111D", po_quantity="10", grn_quantity="3")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-OVERQTY-1", quantity="4", rate="1000.00")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "GRN-confirmed quantity" in submit.json()["detail"]


def test_submit_blocked_without_mandatory_documents(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVEE1111E")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-NODOCS-1")
    inv = create_invoice(client, token, payload).json()
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "Missing mandatory documents" in submit.json()["detail"]


def test_submit_blocked_invalid_gstin(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVFF1111F", gstin=None)
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-NOGSTIN-1")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "GSTIN" in submit.json()["detail"]


def test_submit_blocked_expired_po(client, login_as):
    ctx = setup_po_ready_invoice_context(
        client, login_as, "INVGG1111G", po_overrides={"po_validity_date": "2020-01-01"}
    )
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-EXPIREDPO-1")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "validity date" in submit.json()["detail"]


def test_submit_blocked_expired_agreement(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVHH1111H")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    terminate = client.post(f"/api/v1/agreements/{agreement['id']}/terminate", headers=ctx["accounts_headers"])
    assert terminate.status_code == 200

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-EXPIREDAGR-1")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "Agreement is not Active" in submit.json()["detail"]


def test_rate_variance_over_5_percent_flagged_not_blocked(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVII1111I", po_quantity="10", grn_quantity="5")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    # Rate card rate is 1000.00; 1200.00 is a 20% variance, well over the 5% threshold.
    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-VARIANCE-1", quantity="5", rate="1200.00")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 200
    body = submit.json()
    assert body["status"] == "Submitted"
    assert body["rate_variance_flag"] is True


def test_gst_mismatch_over_1_rupee_blocked(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVJJ1111J")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    # quantity=5, rate=1000 -> taxable=5000, expected GST (18%) = 900. Declare a wrong
    # breakup (200 total) that's internally consistent with total_invoice_amount so the
    # creation-time consistency check passes, but wrong relative to the rate-based expected GST.
    payload = make_invoice_payload(
        po["id"], agreement["id"], item_code_id, "INV-GSTMISMATCH-1", quantity="5", rate="1000.00"
    )
    payload["cgst_amount"] = "100.00"
    payload["sgst_amount"] = "100.00"
    payload["igst_amount"] = "0.00"
    payload["total_invoice_amount"] = "5200.00"
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "GST" in submit.json()["detail"]


def test_msme_vendor_triggers_alert_without_blocking(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVKK1111K", msme_status=True)
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-MSME-1", quantity="2")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 200
    body = submit.json()
    assert body["status"] == "Submitted"
    assert body["msme_alert_triggered"] is True

    notifications = client.get("/api/v1/notifications", headers=ctx["accounts_headers"]).json()
    assert any("INV-MSME-1" in n["message"] for n in notifications)


def test_invoice_date_predating_po_blocked(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVLL1111L")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-PREDATE-1")
    payload["invoice_date"] = (date.today() - timedelta(days=1)).isoformat()
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "predate" in submit.json()["detail"]


def test_invoice_date_future_blocked(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVMM1111M")
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-FUTURE-1")
    payload["invoice_date"] = (date.today() + timedelta(days=5)).isoformat()
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "future" in submit.json()["detail"]


def test_submit_blocked_incomplete_kyc(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVNN1111N", skip_kyc=True)
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-NOKYC-1")
    inv = create_invoice(client, token, payload).json()
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "KYC" in submit.json()["detail"]


def test_submit_blocked_po_not_acknowledged(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVOO1111O", skip_ack=True)
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-NOACK-1")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "Vendor_Acknowledged" in submit.json()["detail"]


def test_submit_blocked_no_grn_exists(client, login_as):
    ctx = setup_po_ready_invoice_context(client, login_as, "INVPP1111P", skip_grn=True)
    po, agreement, item_code_id, token = ctx["po"], ctx["agreement"], ctx["item_code_id"], ctx["token"]

    payload = make_invoice_payload(po["id"], agreement["id"], item_code_id, "INV-NOGRN-1")
    inv = create_invoice(client, token, payload).json()
    upload_all_mandatory_invoice_docs(client, token, inv["id"])
    submit = client.post(f"/api/v1/invoices/{inv['id']}/submit", headers=auth_header(token))
    assert submit.status_code == 422
    assert "GRN/SCN" in submit.json()["detail"]
