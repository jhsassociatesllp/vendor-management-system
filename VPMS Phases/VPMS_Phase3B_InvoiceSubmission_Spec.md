# VPMS — Phase 3B: Invoice Submission Portal (Backend)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 3B of 6 — Procurement, backend only (SRS Module 6)
**Builds on:** Phase 1 (Vendor), Phase 2A (Agreements/Rate Cards), Phase 2B (Vendor Portal/KYC), Phase 3A (PO, Budget, GRN/SCN). Reuse existing models — do not modify them.
**Rule for this phase: build ONLY what is listed below. No approval routing/DoA engine, no payment processing — invoice status in this phase stops at `Submitted`. Later phases will add approval stages on top of what's built here.**

---

## 1. Objective

Let a vendor submit an invoice against a PO (or Agreement, for non-PO billing) with full three-way matching (PO vs GRN/SCN vs Invoice) enforced at submission time, exactly matching the SRS's hard-block / soft-flag / warning / alert severity levels.

**Definition of Done:** A vendor can submit an invoice only when every precondition and hard-block validation passes; rate variance and GST mismatch are surfaced with the correct severity (soft flag vs. must-correct); MSME vendors trigger an alert without being blocked. All tests in Section 7 pass.

---

## 2. Assumptions / Flagged Conflicts (confirm with your manager)

- **Duplicate invoice number scope**: SRS §8.2 says "duplicate check across all vendors" but §8.4's validation table says "duplicate invoice number **(same vendor)**." This spec implements **same-vendor** uniqueness (a vendor cannot reuse their own invoice number; two different vendors coincidentally using the same number is fine). Flag this to your manager — it's a real conflict in the source document, not a minor wording difference.
- **"Total Invoice Amount must match uploaded invoice PDF total"** (§8.2): real PDF parsing/OCR is not built. This phase validates that `total_invoice_amount` = `taxable_amount + total_gst_amount` (internal consistency) but does not cross-check against the actual PDF content. Flagged as a stub, same pattern as the GSTIN-active-check stub from earlier phases.
- **GSTIN "active" check** (hard block per §8.4): stubbed as format-valid + present, same as Phase 1/2A — no real GSTN API call.
- **Invoice status in this phase** is effectively binary — `Submitted` (validations passed) or rejected outright (validations failed, nothing saved). The richer lifecycle (`Query Raised`, per-level approval states) is Module 7 / Phase 4 — the `status` enum includes room for those values but this phase only ever sets `Submitted`.

---

## 3. Data Model

### 3.1 `invoices`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| invoice_number | string | vendor's own number; unique per vendor (see Section 2) |
| vendor_id | FK → vendors | |
| po_id | FK → purchase_orders, nullable | mandatory if PO-based |
| agreement_id | FK → agreements | mandatory always (PO-based invoices still reference the underlying agreement) |
| item_code_id | FK → item_codes | must match the PO's/agreement's item |
| invoice_date | date | cannot predate PO date, cannot be a future date |
| quantity | decimal | mandatory |
| rate | decimal | vendor-entered |
| taxable_amount | decimal | server-computed: quantity × rate |
| cgst_amount, sgst_amount, igst_amount | decimal | vendor-entered breakup |
| total_gst_amount | decimal | server-computed sum of the above |
| total_invoice_amount | decimal | vendor-entered; validated against taxable+GST (see Section 5.7) |
| period_service_from, period_service_to | date | must fall within the agreement's active period |
| billing_milestone_id | FK → billing_milestones, nullable | required only if the agreement's `billing_frequency = Milestone` |
| work_description | text | mandatory |
| rate_variance_flag | boolean | true if rate differs from rate card by >5% |
| gst_mismatch_delta | decimal | absolute difference between vendor's GST breakup and system-computed GST, in ₹ |
| msme_alert_triggered | boolean | true if vendor is MSME |
| status | enum | `Submitted` (only value this phase produces; other values reserved for Phase 4) |
| created_at | timestamp | |

### 3.2 `invoice_documents`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| invoice_id | FK → invoices | |
| document_type | enum | `Invoice_PDF`, `GRN_SCN_Ack`, `Work_Completion_Proof`, `Timesheet`, `Measurement_Sheet`, `PO_Copy` |
| is_mandatory | boolean | `Invoice_PDF`, `GRN_SCN_Ack`, `Work_Completion_Proof` = true; the rest = false |
| file_url | string | stub local path |
| file_hash | string | SHA-256, computed for real (same as Phase 2B's KYC docs) |
| uploaded_at | timestamp | |

---

## 4. Workflow

```
Vendor creates a draft invoice (POST /invoices) — minimal required fields
Vendor uploads documents (POST /invoices/{id}/documents) — as many as needed
Vendor finalizes submission (POST /invoices/{id}/submit)
   → system runs ALL checks in Section 5
   → any HARD_BLOCK check failing → 422 with the specific failed check(s) named, nothing is finalized
   → GST mismatch >₹1 → 422 requiring correction (vendor must fix and resubmit) — see 5.7
   → rate variance >5% → allowed through, `rate_variance_flag=true` set — see 5.6
   → MSME vendor → allowed through, `msme_alert_triggered=true`, notification logged to AP team — see 5.8
   → success → status Submitted, invoice becomes read-only for the vendor from here
```

---

## 5. Business Rules (mapped directly to SRS §8.4's severity table)

1. **Duplicate invoice number (same vendor)** — HARD BLOCK. See Section 2 for the scope decision.
2. **Invoice amount exceeds PO balance** — HARD BLOCK. PO balance = PO's `total_po_value_incl_gst` minus the sum of `total_invoice_amount` across all previously `Submitted` invoices against that PO.
3. **Invoice quantity exceeds GRN-confirmed, not-yet-invoiced quantity** — HARD BLOCK (this is the practical form of SRS §7.4's "invoice should not exceed GRN quantity"). Available = sum of `grn_scn.quantity_confirmed` for that PO minus sum of previously invoiced quantity against that PO.
4. **Missing mandatory supporting document** — HARD BLOCK. All three mandatory `document_type`s must be present before `submit` succeeds.
5. **Vendor GSTIN inactive** — HARD BLOCK (stub check, Section 2).
6. **PO/Agreement expired** — HARD BLOCK. PO: `po_validity_date` in the past. Agreement: `status != Active` or invoice_date outside agreement's date range.
7. **Rate variance >5% from rate card** — SOFT FLAG. Submittable, `rate_variance_flag=true` set for downstream (Phase 4) approval routing to see.
8. **GST calculation mismatch >₹1** — vendor's `total_gst_amount` (cgst+sgst+igst) vs. system-computed expected GST (taxable_amount × agreement's gst_rate) differing by more than ₹1 → block finalization with a clear correction message; not silently accepted.
9. **MSME payment timeline alert** — if `vendors.msme_status = true`, set `msme_alert_triggered=true` and log a notification (reuse the `notifications` table from Phase 2B) addressed to Accounts Executive/AP — does not block submission.
10. **Preconditions before any of the above run** (SRS §8.1) — all HARD BLOCK if unmet:
    - Vendor is active and KYC profile is complete (reuse Phase 2B's `/vendor-portal/profile/status` logic)
    - For PO-based invoices: PO status is `Vendor_Acknowledged` (i.e., vendor has acknowledged it per Phase 3A)
    - At least one GRN/SCN entry exists for that PO
11. **Invoice date validation**: cannot predate the PO's `po_date`, cannot be a future date.
12. **Period of service** must fall within the agreement's `agreement_start_date`/`agreement_end_date`.
13. **Billing milestone linkage**: if the agreement's `billing_frequency = Milestone`, `billing_milestone_id` is mandatory and must belong to that agreement.

---

## 6. API Endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/api/v1/invoices` | Create a draft invoice | Vendor (own vendor only) |
| POST | `/api/v1/invoices/{id}/documents` | Upload a supporting document | Vendor (own only) |
| POST | `/api/v1/invoices/{id}/submit` | Run all validations, finalize | Vendor (own only) |
| GET | `/api/v1/invoices` | List invoices (own for Vendor; all for internal roles) | Any authenticated |
| GET | `/api/v1/invoices/{id}` | View one invoice | Any authenticated with visibility per above |
| GET | `/api/v1/purchase-orders/{po_id}/balance` | Remaining PO value + quantity | Any authenticated |

---

## 7. Required Tests (automated, pytest + httpx)

1. `test_duplicate_invoice_number_same_vendor_blocked`
2. `test_duplicate_invoice_number_different_vendor_allowed` — confirms the Section 2 scope decision
3. `test_invoice_amount_exceeding_po_balance_blocked`
4. `test_invoice_quantity_exceeding_grn_available_blocked`
5. `test_submit_blocked_without_mandatory_documents`
6. `test_submit_blocked_invalid_gstin`
7. `test_submit_blocked_expired_po`
8. `test_submit_blocked_expired_agreement`
9. `test_rate_variance_over_5_percent_flagged_not_blocked` — submits successfully with `rate_variance_flag=true`
10. `test_gst_mismatch_over_1_rupee_blocked`
11. `test_msme_vendor_triggers_alert_without_blocking`
12. `test_invoice_date_predating_po_blocked`
13. `test_invoice_date_future_blocked`
14. `test_submit_blocked_incomplete_kyc`
15. `test_submit_blocked_po_not_acknowledged`
16. `test_submit_blocked_no_grn_exists`

Run with: `pytest tests/ -v`. **All 16 must pass.**

---

## 8. Manual Verification

1. As a vendor with incomplete KYC, try submitting an invoice — confirm it's blocked with a clear reason.
2. Complete KYC (from Phase 2B), acknowledge an Approved PO, record a GRN against it (as Dept. Manager).
3. As the vendor, create a draft invoice, upload the three mandatory documents, submit — confirm success.
4. Try submitting a second invoice with the same invoice number as the vendor — confirm it's blocked; try the same number as a *different* vendor — confirm it's allowed.
5. Submit an invoice with a rate >5% off the rate card — confirm it succeeds but is flagged.
6. Submit an invoice with a deliberately wrong GST breakup — confirm it's blocked with a correction message.
7. Check `/purchase-orders/{po_id}/balance` before and after a successful submission — confirm it decreases correctly.
8. As an MSME vendor, submit a valid invoice — confirm a notification appears for Accounts Executive without the submission being blocked.

---

## 9. Explicitly Out of Scope for This Phase

No approval routing/DoA engine (Phase 4), no query-raise/return-to-vendor workflow (also Module 7, Phase 4), no payment processing or TDS deduction at payment (Phase 4), no MIS/aging reports. Real PDF content verification and real GSTIN-active API checks remain stubbed per Section 2.

---

## 10. Instructions for the Coding Agent

Build in order: Section 3 (models) → Section 4 (submission workflow) → Section 5 (all 13 business rules — implement each as an independently testable check, since Section 7's tests exercise them individually) → Section 6 (endpoints). Run tests continuously, not just at the end. If the invoice-number duplicate-scope assumption in Section 2 turns out to already be implemented differently somewhere, stop and flag it rather than silently overriding. Report which files were created/changed when done.
