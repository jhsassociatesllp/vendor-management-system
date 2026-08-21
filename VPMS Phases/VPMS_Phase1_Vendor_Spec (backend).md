# VPMS — Phase 1: Vendor Shortlisting, Approval & Vendor Master

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 1 of 6 — Vendor (SRS Modules M1 + M2)
**Builds on:** Phase 0 (Auth + RBAC) — reuse its users, roles, and `require_role` dependency. Do not rebuild auth.
**Rule for this phase: build ONLY what is listed below. Do not create Agreement, Vendor Portal login, PO, Invoice, Approval-workflow, or Payment tables yet — those are later phases.**

---

## 1. Objective

Implement the upstream vendor lifecycle: a department raises a vendor request → Accounts reviews it → Partner/VP gives final approval → Accounts Executive creates the Vendor Code. This is the SRS's mandatory gate — no vendor code may exist without passing through this flow.

**Definition of Done:** A vendor request can be created, moved through review and approval by the correct roles only, rejected-and-archived correctly, and on approval produce an active Vendor record with a valid auto-generated Vendor Code. All tests in Section 7 pass.

---

## 2. Additional Roles Needed (already seeded in Phase 0 — confirm they exist)

`Dept. Manager`, `Accounts Executive`, `Partner / VP`, `System Admin`. If any are missing from Phase 0's seed, add them now — do not change Phase 0's auth/RBAC mechanics.

---

## 3. Data Model

### 3.1 `vendor_requests`

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| requested_by | FK → users | must have role Dept. Manager or higher |
| business_need | text | mandatory |
| category | string | service / supply category |
| estimated_annual_spend | decimal | mandatory |
| recommended_vendor_name | string | mandatory |
| recommended_pan | string(10) | mandatory, format-validated (see 5.1) |
| recommended_gstin | string(15) | optional, format-validated if provided |
| financial_stability_ok | boolean | evaluation checklist — mandatory |
| technical_capability_ok | boolean | evaluation checklist — mandatory |
| compliance_status_ok | boolean | evaluation checklist — mandatory |
| blacklist_check_ok | boolean | evaluation checklist — mandatory |
| conflict_of_interest_declared | boolean | evaluation checklist — mandatory |
| references_provided | boolean | evaluation checklist — recommended, not mandatory |
| msme_udyam_number | string | required only if vendor claims MSME status |
| status | enum | `Submitted`, `Accounts_Review`, `Pending_Partner_Approval`, `Approved`, `Rejected`, `Archived` |
| rejection_reason | text | required when status = Rejected |
| accounts_reviewed_by | FK → users, nullable | |
| accounts_reviewed_at | timestamp, nullable | |
| partner_decided_by | FK → users, nullable | |
| partner_decided_at | timestamp, nullable | |
| created_at | timestamp | |

### 3.2 `vendors`

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| vendor_code | string, unique | format `VND-YYYY-NNNN`, system-generated, never reused |
| source_request_id | FK → vendor_requests | |
| vendor_name | string | mandatory |
| pan | string(10), unique | mandatory, format-validated |
| gstin | string(15) | format-validated if present |
| msme_status | boolean | |
| udyam_number | string, nullable | mandatory if msme_status = true |
| vendor_category | enum | Professional / Service / Goods Supplier / Recurring |
| tds_section | string | auto-suggested from category, overridable with a reason field |
| bank_account_no | string | mandatory |
| ifsc_code | string | mandatory, format-validated |
| bank_name | string | auto-populated from IFSC (stub the IFSC lookup — see Section 6) |
| bank_branch | string | auto-populated from IFSC (stub) |
| cancelled_cheque_doc_url | string | mandatory (file upload can be a stub/local path for now) |
| address | text | mandatory |
| email | string | mandatory, format-validated |
| mobile_number | string(10) | mandatory, format-validated |
| is_active | boolean | default true |
| created_at | timestamp | |

### 3.3 `item_codes`

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| category | string | |
| sub_category | string | |
| description | string | |
| unit | string | |
| default_rate | decimal | |
| is_active | boolean | default true |

### 3.4 `vendor_item_codes` (join table)

| Field | Type | Notes |
|---|---|---|
| vendor_id | FK → vendors | |
| item_code_id | FK → item_codes | |
| is_active | boolean | unique combination of (vendor_id, item_code_id) |

---

## 4. Workflow (state machine for `vendor_requests.status`)

```
Submitted
   → Accounts_Review        (Accounts Executive picks it up)
        → Pending_Partner_Approval   (Accounts Executive clears it)
             → Approved      (Partner/VP approves) → triggers vendor code creation eligibility
             → Rejected      (Partner/VP rejects, reason required)
        → Rejected           (Accounts Executive can also reject at this stage, reason required)
   → Rejected → Archived     (rejected requests move to Archived; cannot be resubmitted directly —
                               a brand-new request must be created; log this as a business rule,
                               don't build an "escalation override" UI yet)
```

Only `Approved` requests are eligible for the vendor-code-creation step in Section 5.3.

---

## 5. Business Rules

### 5.1 Format validations
- PAN: 10 characters, pattern `[A-Z]{5}[0-9]{4}[A-Z]{1}`
- GSTIN: 15 characters, pattern `[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}`
- Mobile: exactly 10 digits
- Email: standard email format
- IFSC: 11 characters, pattern `[A-Z]{4}0[A-Z0-9]{6}`

### 5.2 Duplicate vendor check
Before creating a `vendor_request`, check `recommended_pan` (and `recommended_gstin` if provided) against:
- existing active `vendors.pan`
- any `vendor_requests` currently in `Submitted` / `Accounts_Review` / `Pending_Partner_Approval`

If a match is found, reject the create with a clear error — do not silently allow duplicates.

### 5.3 Vendor Code generation
- Format: `VND-{year}-{4-digit sequence}`, e.g. `VND-2026-0001`
- Only callable by `Accounts Executive` (or `System Admin`), only on a `vendor_request` with status `Approved`, only once per request
- Sequence must never repeat, even if a vendor is later deactivated — track the next sequence number, don't reuse gaps

### 5.4 IFSC → bank name/branch lookup
Stub this: hardcode a small lookup table (5–10 well-known IFSC codes) or a fixed fake response — do not wire a real bank API in this phase. Just prove the field auto-populates and is not manually editable by the user.

### 5.5 Vendor Item Code linkage
- A vendor can be linked to multiple item codes
- The (vendor_id, item_code_id) pair must be unique
- Inactive combinations should be excluded from any "active vendor-item" listing endpoint (this will matter for Invoice validation in a later phase — just make sure the `is_active` flag is queryable now)

### 5.6 Activation notification
Stub only — on vendor code creation, write a log line / store a record of "notification would be sent to {email}, {mobile}" rather than wiring real email/SMS. Real gateway integration is a later phase.

---

## 6. API Endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/api/v1/vendor-requests` | Create a new vendor request | Dept. Manager, Partner/VP, System Admin |
| GET | `/api/v1/vendor-requests` | List requests (all for Accounts/Partner/Admin; own-only for Dept. Manager) | Any authenticated |
| GET | `/api/v1/vendor-requests/{id}` | View one request | Any authenticated with visibility per above |
| POST | `/api/v1/vendor-requests/{id}/accounts-review` | Accounts Executive advances to Pending_Partner_Approval, or rejects | Accounts Executive, System Admin |
| POST | `/api/v1/vendor-requests/{id}/partner-decision` | Partner/VP approves or rejects | Partner / VP, System Admin |
| POST | `/api/v1/vendors/from-request/{request_id}` | Create Vendor + auto-generate Vendor Code from an Approved request | Accounts Executive, System Admin |
| GET | `/api/v1/vendors` | List vendors | Any authenticated (read) |
| GET | `/api/v1/vendors/{id}` | View one vendor | Any authenticated (read) |
| POST | `/api/v1/item-codes` | Create an item master entry | Accounts Executive, System Admin |
| GET | `/api/v1/item-codes` | List item codes | Any authenticated |
| POST | `/api/v1/vendors/{vendor_id}/item-codes` | Link vendor to one or more item codes | Accounts Executive, System Admin |

---

## 7. Required Tests (automated, pytest + httpx)

1. `test_create_vendor_request_success` — Dept. Manager creates a valid request → 201, status = `Submitted`
2. `test_create_vendor_request_blocked_for_vendor_role` — a `Vendor`-role user attempting to create a request → 403
3. `test_duplicate_pan_blocked` — creating a request with a PAN that matches an existing active vendor → 400/409 with clear error
4. `test_invalid_pan_format_rejected` — malformed PAN → 422
5. `test_accounts_review_advances_status` — Accounts Executive reviews a Submitted request → status becomes `Pending_Partner_Approval`
6. `test_accounts_review_blocked_for_dept_manager` — Dept. Manager cannot call the accounts-review endpoint → 403
7. `test_partner_approval_sets_approved` — Partner/VP approves a Pending_Partner_Approval request → status `Approved`
8. `test_partner_rejection_requires_reason` — rejecting without a reason → 422
9. `test_rejected_request_moves_to_archived` — rejected request's final state is `Archived`
10. `test_vendor_code_creation_generates_correct_format` — creating a vendor from an Approved request produces `vendor_code` matching `VND-YYYY-NNNN`
11. `test_vendor_code_creation_blocked_if_not_approved` — attempting vendor creation from a `Submitted` or `Rejected` request → 400
12. `test_vendor_code_creation_blocked_for_dept_manager` — only Accounts Executive/Admin can create the vendor → 403
13. `test_vendor_item_code_link_unique` — linking the same (vendor, item_code) pair twice → 400/409

Run with: `pytest tests/ -v`. **All 13 must pass.**

---

## 8. Manual Verification

1. Log in as a Dept. Manager, create a vendor request via Swagger.
2. Log in as Accounts Executive, list requests, advance it via accounts-review.
3. Log in as Partner/VP, approve it.
4. Log back in as Accounts Executive, call the vendor-creation endpoint — confirm a Vendor Code like `VND-2026-0001` is returned.
5. Try the same flow with a duplicate PAN on a second request — confirm it's blocked at creation.
6. Create an item code, link it to the new vendor, confirm the link appears when listing.

---

## 9. Explicitly Out of Scope for This Phase

Do not build: Agreement/Rate Card, Vendor self-service portal/login, PO, Invoice, Approval workflow beyond the two steps above, Payment, MIS/reports. Do not wire real GSTN/NSDL/IFSC/email/SMS APIs — all are stubbed per Section 5.4 and 5.6. These come in later phases as separate spec documents.

---

## 10. Instructions for the Coding Agent

Build in the order: Section 3 (models) → Section 4 (state machine) → Section 5 (business rules) → Section 6 (endpoints), running Section 7's tests continuously. Stop once all 13 tests pass and report which files were created/changed, plus any place a business rule from Section 5 wasn't fully implementable without a decision — flag it rather than guessing.
