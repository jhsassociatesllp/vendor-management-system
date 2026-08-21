# VPMS — Phase 5: MIS Dashboard, Standard Reports & Audit Trail (Backend)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 5 of 6 (final backend phase) — SRS Module 9
**Builds on:** Every previous phase (0 through 4B). This phase reads from all of them for dashboards/reports, AND retrofits audit logging into their existing write endpoints — see Section 4 for the strict rules governing that retrofit.

---

## 1. Objective

Give Management/Finance a real-time dashboard and the 11 standard reports the SRS specifies, and implement a tamper-evident, append-only audit trail that captures every write action across the entire application (plus login/logout and a few sensitive views).

**Definition of Done:** The dashboard's KPIs and aging buckets compute correctly against real data from every prior phase. All 11 reports return correct, filterable data with CSV export. Every meaningful write action anywhere in the app produces an audit log entry with old/new field values. The audit log has no update or delete endpoint anywhere. Every previous phase's existing test suite still passes after the retrofit. This phase's own tests (Section 8) pass.

---

## 2. Assumptions / Scope Decisions (confirm with your manager)

- **Form 26Q and Form 16A are data-only in this phase.** Real NSDL-compatible file formatting and signed PDF certificate generation are compliance-grade deliverables that need dedicated attention (likely a specialist review, not just a coding task) — this phase produces the correct underlying data (vendor PAN, section, gross amount, TDS deducted) via a report endpoint, not the actual government-format export file or the certificate PDF.
- **"Every single action" audit logging is scoped to**: all write actions (create/update/approve/reject/delete) across every module, plus login/logout/failed-login, plus document upload events. It does NOT include logging every GET/list/view request across the app — that would mean auditing normal browsing, which isn't practical or that valuable. The exception: viewing a vendor's bank details or a KYC document is logged as a sensitive view, per the SRS's specific mention of these as high-sensitivity fields.
- **Real-time GSTN/PAN/NSDL API integrations mentioned in SRS §12 remain stubbed**, consistent with every prior phase — this phase doesn't change that.
- **Tamper-evidence, not tamper-proof in the absolute sense.** True tamper-proof storage (WORM storage, blockchain, etc.) is an infrastructure decision beyond a single phase. This phase implements a hash-chain (each audit row's hash includes the previous row's hash) so any modification to a stored row is *detectable* via an integrity-check endpoint — it does not physically prevent someone with direct database access from editing rows. Flag this distinction to your manager if physical tamper-proofing is a hard compliance requirement.

---

## 3. Data Model

### 3.1 `audit_logs`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| timestamp | timestamp | second-level precision, stored with timezone |
| user_id | FK → users, nullable | null only for `action = System` |
| user_name_snapshot | string | captured at log time (don't rely on a join to a possibly-later-changed user record) |
| role_snapshot | string | |
| ip_address | string | from the request |
| action | enum | `Create`, `Update`, `Approve`, `Reject`, `Delete`, `View`, `Login`, `Logout`, `Login_Failed`, `Document_Upload`, `System` |
| module | string | e.g. `Vendor`, `Agreement`, `PurchaseOrder`, `Invoice`, `Payment` |
| record_reference | string | e.g. `VND-2026-0047`, `INV-2026-1234` |
| field_changes | json, nullable | list of `{field, old_value, new_value}` — required for `Update` actions, null for others |
| session_id | string, nullable | |
| previous_hash | string | hash of the immediately preceding audit_logs row; `"0"×64` for the first row ever |
| record_hash | string | SHA-256 of this row's content + `previous_hash` |

**No update or delete endpoint exists for this table anywhere in the API — enforce this by simply never building one, not by a permission check that could be bypassed.**

---

## 4. Audit Logging Retrofit — Rules for Touching Previous Phases

This is the one phase where you will edit files from Phases 0–4B. Follow these rules exactly:

1. Build a single shared utility, e.g. `log_audit(user, action, module, record_reference, field_changes=None)`, once, in this phase.
2. Go through every existing write endpoint (POST/PATCH/PUT that creates or changes data) across every previous phase and add **one call** to this utility, capturing old/new values for `Update`-type actions by comparing the record before and after the change.
3. **Never** change an existing endpoint's response body, status code, validation logic, or business rules while doing this. If adding the audit call reveals a bug in older code, do not fix it silently — flag it and ask before touching anything beyond the audit call itself.
4. Add `Login`/`Logout`/`Login_Failed` logging to Phase 0's auth endpoints the same way — additive only.
5. **After the retrofit, re-run every previous phase's pytest suite (Phases 0 through 4B) and confirm 100% still pass.** This is not optional — report the full re-run results alongside this phase's own new tests.
6. A representative (not exhaustive — apply the same pattern everywhere else) list of what must get an audit call: vendor request approval/rejection (Phase 1), vendor master creation (Phase 1), KYC document review (Phase 2B), bank change approval (Phase 2B), agreement/rate-card creation and amendment approval (Phase 2A), PO creation/approval/cancellation/amendment (Phase 3A), invoice submission (Phase 3B), every approval action at every level (Phase 4A), payment recording and confirmation (Phase 4B).

---

## 5. API Endpoints — Dashboard & Reports

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/api/v1/mis/dashboard/summary` | Total payables, overdue invoice count, MSME risk count, budget utilization % | Partner/VP, Finance Head, System Admin |
| GET | `/api/v1/mis/dashboard/aging` | Aging buckets (0–30/30–60/60–90/90+ days) | same |
| GET | `/api/v1/mis/dashboard/spend-by-category` | Spend by category, with period-over-period comparison; supports drill-down query params (`vendor_id`, `department`, `category`, `date_from`, `date_to`) | same |
| GET | `/api/v1/reports/vendor-master` | Vendor code, name, category, MSME status, KYC status, TDS section | Accounts Executive, Finance, Partner/VP, System Admin |
| GET | `/api/v1/reports/vendor-compliance-status` | GSTIN/PAN status, bank verification, document expiry | same |
| GET | `/api/v1/reports/invoice-tracker` | Full lifecycle timestamps per invoice | same |
| GET | `/api/v1/reports/pending-invoices` | Invoice, vendor, amount, current stage, days pending | same |
| GET | `/api/v1/reports/payment-register` | Date, vendor, gross, TDS, net paid, UTR | Finance Team, Finance Head, System Admin |
| GET | `/api/v1/reports/tds-summary` | Vendor PAN, section, gross, TDS — data only, see Section 2 | same |
| GET | `/api/v1/reports/form16a-data` | TDS certificate data per vendor per quarter — data only, see Section 2 | same |
| GET | `/api/v1/reports/msme-payment` | Vendor, invoice date, acceptance date, due date, payment date, delay | same |
| GET | `/api/v1/reports/budget-utilisation` | Budget head, sanctioned, committed, paid, available | Budget Controller, Finance, Partner/VP, System Admin |
| GET | `/api/v1/reports/aging-analysis` | Vendor, amount, invoice date, aging bucket, overdue days | Finance, Partner/VP, System Admin |
| GET | `/api/v1/reports/vendor-performance` | Submission accuracy, TAT compliance, query frequency | same |
| GET | `/api/v1/reports/approval-tat` | Stage, approver, average TAT, breaches, escalations | same |

Every report endpoint above supports:
- Common filter query params where applicable: `date_from`, `date_to`, `vendor_id`, `department`
- `?format=csv` to return a CSV instead of JSON — implement this once as a shared response formatter, don't duplicate CSV logic per endpoint

## 6. API Endpoints — Audit Trail

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/api/v1/audit-logs` | List/filter audit entries (by user, module, action, date range, record_reference) | Compliance/Audit, System Admin |
| GET | `/api/v1/audit-logs/{id}` | View one entry with full field_changes detail | Compliance/Audit, System Admin |
| GET | `/api/v1/audit-logs/integrity-check` | Recompute the hash chain, report any break | Compliance/Audit, System Admin |

---

## 7. Business Rules

1. **Append-only enforcement**: literally no route exists to modify or delete an `audit_logs` row.
2. **Hash chain**: `record_hash = SHA256(serialized_row_content + previous_hash)`; the integrity-check endpoint walks the whole table in order and confirms each row's stored hash matches a fresh recomputation — any mismatch is reported with the specific row id.
3. **Field-level diffs**: `Update` actions must capture actual before/after values per changed field, not just "record was updated."
4. **Dashboard KPIs must reflect real data**: total payables = sum of `net_payable_amount` for unpaid `Approved_For_Payment` invoices; overdue count = invoices past `payment_due_date` and unpaid; MSME risk count = MSME invoices within 7 days of or past due; budget utilization % = committed+paid vs. sanctioned, aggregated appropriately.
5. **Aging buckets** are computed from `payment_due_date` (or invoice date, if no due date exists — pick one and be consistent) into the four SRS-specified ranges.
6. **CSV export correctness**: exported CSV must contain the exact same filtered dataset as the JSON response for the same query parameters — no silently different default filters between the two formats.

---

## 8. Required Tests (automated, pytest + httpx)

1. `test_audit_log_created_on_representative_write_action` — e.g. approving a vendor request produces a log entry
2. `test_audit_log_created_on_login_and_failed_login`
3. `test_audit_logs_have_no_update_or_delete_route` — confirm no such endpoint exists (404/405)
4. `test_hash_chain_integrity_passes_on_unmodified_data`
5. `test_hash_chain_integrity_detects_tampered_row` — directly mutate a row in the test DB, confirm the integrity-check endpoint flags it
6. `test_field_level_changes_captured_on_update` — e.g. a KYC review status change logs old/new status
7. `test_dashboard_summary_kpis_correct_against_seeded_data`
8. `test_aging_buckets_correct`
9. `test_vendor_master_report_fields_correct`
10. `test_pending_invoices_report_shows_current_stage_and_days`
11. `test_payment_register_matches_recorded_payments`
12. `test_tds_summary_aggregates_correctly`
13. `test_budget_utilisation_report_matches_commitments`
14. `test_csv_export_matches_json_dataset_for_same_filters`
15. `test_auditor_role_blocked_from_all_write_endpoints_across_app` — spot-check a few endpoints from different phases, confirm Compliance/Audit role gets 403 on all of them (this is really testing that the "view only, no write access" role from Phase 0's role table was respected throughout, not just here)

Run with: `pytest tests/ -v`. **All 15 must pass, AND all previous phases' suites must still pass (Section 4, rule 5).**

---

## 9. Manual Verification

1. Perform a handful of actions across different modules (approve a vendor request, review a KYC doc, approve a PO) and confirm each produces a correctly-detailed audit log entry.
2. Run the integrity-check endpoint — confirm it reports clean. Manually edit one row directly in the database, run it again — confirm it flags the break.
3. Check the dashboard summary and aging buckets against your own manual tally of the seeded test data.
4. Pull each of the 11 reports, sanity-check the numbers, and confirm CSV export matches.
5. Log in as an Auditor-role user, confirm you can view the audit trail and every report, but cannot find a single write action available anywhere.

---

## 10. Explicitly Out of Scope for This Phase

Real NSDL-format Form 26Q file export, real signed Form 16A PDF certificate generation (Section 2), real GSTN/PAN/NSDL API integrations, physical tamper-proof storage (Section 2), scheduled/automated report generation or emailing (all reports are on-demand pulls in this phase, even the ones the SRS lists as "Daily"/"Monthly" frequency — that's a future scheduling concern, not a data/logic gap).

---

## 11. Instructions for the Coding Agent

Build the audit infrastructure first (Section 3–4) and get the retrofit + full regression re-run done and confirmed clean before starting the dashboard/reports work in Sections 5–8 — the reports will be more meaningful to sanity-check once real audit data exists alongside the transactional data. This phase touches more files than any previous one; work through it phase-by-phase (retrofit Phase 0's endpoints, confirm Phase 0's tests still pass, then Phase 1, etc.) rather than editing everything at once and re-running tests only at the end — that makes it far easier to isolate which change broke something, if anything does. Report which files were created/changed when done, and include the full pass/fail status of every previous phase's test suite, not just this phase's own 15 tests.
