# VPMS — Phase 2A: Agreement & Rate Card Management (Backend)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 2A of 6 — Contracts, backend only (SRS Module 3)
**Builds on:** Phase 0 (Auth/RBAC) and Phase 1 (Vendor Master, Item Codes). Reuse existing users/roles/models — do not modify them.
**Rule for this phase: build ONLY what is listed below. No Vendor Portal login/registration, no PO, no Invoice, no Payment — those are later phases.**

---

## 1. Objective

Every vendor engagement needs a formal Agreement recording scope, billing terms, and a Rate Card — this becomes the source of truth that PO and Invoice modules will validate against later. This phase also implements the formal change-control process for rate amendments (a rate can't just be edited — it must go through a proposal + approval step).

**Definition of Done:** An Agreement can be created against an existing Vendor, linked to one or more Item Codes already in the system, with an initial Rate Card. A rate amendment can be proposed and must be approved by a separate authorized role before it takes effect. Expiring agreements can be queried. All tests in Section 7 pass.

---

## 2. Assumptions Added Beyond the SRS (confirm with your manager if these matter)

The SRS doesn't explicitly state these — they're reasonable engineering defaults, not literal requirements. Flagging them so nothing gets mistaken for a business rule your manager actually specified:

- Milestone percentages for a single agreement should sum to ≤100% (prevents obviously-wrong data entry).
- A Rate Card line's `effective_from`/`effective_to` must fall within its Agreement's start/end dates.
- Volume-tiered pricing is accepted as a `pricing_type` value but its tier logic is **not** implemented in this phase — flagged as a future extension (see Section 9). Fixed, Per-Unit, and Milestone pricing are fully implemented.

---

## 3. Data Model

### 3.1 `agreements`

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| agreement_number | string, unique | format `AGR-YYYY-NNNN`, auto-generated, sequence never reused |
| vendor_id | FK → vendors | must be an active vendor |
| scope_of_work | text | mandatory |
| supporting_document_url | string | mandatory (stub file storage — local path is fine) |
| billing_frequency | enum | `Monthly`, `Quarterly`, `Milestone`, `Ad_hoc` |
| agreement_start_date | date | mandatory |
| agreement_end_date | date | mandatory, must be ≥ start date |
| auto_renewal_flag | boolean | default false |
| po_requirement | enum | `Mandatory`, `Optional`, `Not_Required` |
| credit_period_days | integer | mandatory |
| tds_section | string | defaults from `vendors.tds_section`; if overridden, `tds_override_reason` is mandatory |
| tds_override_reason | text, nullable | required only if tds_section differs from vendor default |
| gst_rate | decimal | mandatory |
| reverse_charge_flag | boolean | default false |
| approved_by_designation | string | mandatory (free text designation, not a user FK — per SRS wording) |
| status | enum | `Active`, `Expired`, `Terminated` (computed/settable — see Section 5.4) |
| created_at | timestamp | |

### 3.2 `agreement_item_codes` (join table — items covered under this agreement)

| Field | Type |
|---|---|
| agreement_id | FK → agreements |
| item_code_id | FK → item_codes |

At least one row required per agreement (enforced at creation).

### 3.3 `rate_cards`

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| agreement_id | FK → agreements | |
| item_code_id | FK → item_codes | must exist in that agreement's `agreement_item_codes` |
| pricing_type | enum | `Fixed`, `Per_Unit`, `Milestone`, `Volume_Tiered` |
| rate | decimal, nullable | required for Fixed/Per_Unit; not required for Milestone (uses `billing_milestones` instead) |
| effective_from | date | must be within agreement's start/end |
| effective_to | date, nullable | must be within agreement's start/end if set |
| is_active | boolean | default true |
| created_at | timestamp | |

### 3.4 `billing_milestones` (only used when `billing_frequency = Milestone`)

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| agreement_id | FK → agreements | |
| description | string | mandatory |
| percentage_of_contract_value | decimal | mandatory |
| expected_date | date | mandatory |
| deliverables | text | mandatory |
| status | enum | `Pending`, `Achieved`, `Invoiced` — default `Pending` |

### 3.5 `rate_card_amendments`

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| rate_card_id | FK → rate_cards | the original/active rate card being amended |
| proposed_rate | decimal | mandatory |
| reason | text | mandatory |
| status | enum | `Pending`, `Approved`, `Rejected` |
| requested_by | FK → users | |
| requested_at | timestamp | |
| approved_by | FK → users, nullable | |
| approved_at | timestamp, nullable | |

---

## 4. Workflow

### 4.1 Rate Amendment (formal change control per SRS §5.2)
```
Accounts Executive proposes amendment → status Pending
   → Partner/VP approves → new rate_card row created (is_active=true, effective_from=today),
                            old rate_card row's effective_to set to yesterday, is_active=false
   → Partner/VP rejects → amendment status Rejected, original rate_card untouched
```
The Accounts Executive who proposed an amendment cannot also approve it — this must be a different, higher-authority role, same principle as the Phase 1 approval separation.

### 4.2 Agreement status
- `Active`: today is between start and end date
- `Expired`: today is after end date
- `Terminated`: manually set by Accounts Executive/Admin (early termination) — not date-driven

---

## 5. Business Rules

1. **Agreement Number**: `AGR-{year}-{4-digit sequence}`, unique, never reused.
2. **Date validation**: `agreement_end_date` ≥ `agreement_start_date`.
3. **Coverage requirement**: an agreement must list ≥1 item code in `agreement_item_codes` at creation.
4. **Rate card item scoping**: a rate card's `item_code_id` must already be in that agreement's covered items — reject otherwise.
5. **Rate card date scoping** *(assumption, see Section 2)*: `effective_from`/`effective_to` must fall within the agreement's start/end dates.
6. **Milestone total** *(assumption, see Section 2)*: sum of `percentage_of_contract_value` across an agreement's milestones must not exceed 100%.
7. **TDS override**: if `tds_section` on the agreement differs from `vendors.tds_section`, `tds_override_reason` is mandatory.
8. **Amendment separation of duties**: `requested_by` and `approved_by` on a `rate_card_amendments` row must be different users, and the approver must hold Partner/VP (or Admin).
9. **Expiry query**: an endpoint must be able to return agreements expiring within N days (for 60/30/7-day alerting later) — this phase only needs the query to work correctly; actual scheduled alerting/email is out of scope (stub/log only, same pattern as Phase 1's notification stub).

---

## 6. API Endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/api/v1/agreements` | Create agreement with covered item codes | Accounts Executive, System Admin |
| GET | `/api/v1/agreements` | List agreements | Any authenticated |
| GET | `/api/v1/agreements/{id}` | View one agreement (with covered items, rate cards, milestones) | Any authenticated |
| GET | `/api/v1/agreements/expiring?days={n}` | Agreements expiring within n days | Accounts Executive, Partner/VP, System Admin |
| POST | `/api/v1/agreements/{id}/terminate` | Manually terminate an agreement | Accounts Executive, System Admin |
| POST | `/api/v1/agreements/{id}/rate-cards` | Add an initial rate card line | Accounts Executive, System Admin |
| GET | `/api/v1/agreements/{id}/rate-cards` | List rate cards for an agreement | Any authenticated |
| POST | `/api/v1/agreements/{id}/milestones` | Add a billing milestone | Accounts Executive, System Admin |
| POST | `/api/v1/rate-cards/{id}/amendments` | Propose a rate amendment | Accounts Executive, System Admin |
| POST | `/api/v1/rate-card-amendments/{id}/approve` | Approve amendment (activates new rate) | Partner / VP, System Admin |
| POST | `/api/v1/rate-card-amendments/{id}/reject` | Reject amendment | Partner / VP, System Admin |

---

## 7. Required Tests (automated, pytest + httpx)

1. `test_create_agreement_success` — valid agreement with ≥1 covered item → 201
2. `test_agreement_requires_item_coverage` — creating with zero item codes → 400/422
3. `test_agreement_end_before_start_rejected` — end date before start date → 422
4. `test_agreement_number_format` — returned `agreement_number` matches `AGR-YYYY-NNNN`
5. `test_rate_card_item_must_be_covered` — rate card referencing an item not in the agreement's coverage → 400
6. `test_rate_card_dates_must_be_within_agreement` — rate card `effective_from` outside agreement dates → 400
7. `test_milestone_total_cannot_exceed_100_percent` — adding milestones summing >100% → 400
8. `test_tds_override_requires_reason` — agreement TDS section differs from vendor default with no reason → 422
9. `test_amendment_proposal_creates_pending` — proposing an amendment → status `Pending`, original rate card untouched
10. `test_amendment_approval_activates_new_rate` — Partner/VP approves → new rate card active, old one's `effective_to`/`is_active` updated correctly
11. `test_amendment_self_approval_blocked` — same user who proposed cannot approve → 403
12. `test_amendment_approval_blocked_for_accounts_executive` — Accounts Executive (non-Partner) attempting to approve → 403
13. `test_expiring_agreements_query` — seed agreements with varying end dates, confirm `expiring?days=30` returns the correct subset
14. `test_create_agreement_blocked_for_dept_manager` — Dept. Manager cannot create agreements → 403

Run with: `pytest tests/ -v`. **All 14 must pass.**

---

## 8. Manual Verification

1. Log in as Accounts Executive, create an agreement against an existing vendor (from Phase 1) with one covered item code, add a Fixed rate card.
2. View the agreement — confirm covered items and rate card show correctly.
3. Propose a rate amendment on that rate card with a reason.
4. Log in as the same Accounts Executive user, try approving your own amendment — confirm it's blocked.
5. Log in as Partner/VP, approve the amendment — confirm the old rate card is now inactive and a new active one exists with the new rate.
6. Query `/agreements/expiring?days=60` and confirm results make sense against the seeded dates.
7. Terminate an agreement, confirm its status changes and it no longer appears as eligible for new rate cards (add a test/check for this if not already covered above).

---

## 9. Explicitly Out of Scope for This Phase

No Vendor Portal (login, KYC upload, OTP) — that's Phase 2B, coming next. No PO, Invoice, Payment, MIS. Volume-tiered pricing logic is not implemented (enum value accepted, no tier table/calculation). No real document storage (stub local path), no scheduled expiry-alert emails (stub/log only, per Phase 1's precedent).

---

## 10. Instructions for the Coding Agent

Build in order: Section 3 (models) → Section 4 (amendment workflow) → Section 5 (business rules) → Section 6 (endpoints), testing continuously per Section 7. If any assumption in Section 2 conflicts with something you find already implemented from Phase 1, stop and flag it rather than silently resolving it either way. Report which files were created/changed when done.
