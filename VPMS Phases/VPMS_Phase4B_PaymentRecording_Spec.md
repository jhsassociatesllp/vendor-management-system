# VPMS — Phase 4B: Payment Status Recording (Backend)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 4B of 6 — Approvals & Finance, backend only (SRS Module 8, scope-adjusted)
**Builds on:** Phase 4A (invoices reaching `Approved_For_Payment`). Reuse existing models — do not modify Phase 4A's tested logic.
**Rule for this phase: build ONLY what is listed below.**

---

## 1. Objective

**Scope correction from the original SRS reading**: VPMS does not execute payments. JHS's internal accounts team makes the actual bank transfer outside this system. VPMS's job is to let Finance **record that a payment was made** (amount, TDS, mode, UTR, date) with a maker-checker control on that recording — not to initiate NEFT/RTGS transfers. Everything in Module 8 that implied bank execution (payment mode "selection" driving an actual transfer, bank integration for UTR) is reinterpreted as **data entry about a payment that already happened**.

**Definition of Done:** An `Approved_For_Payment` invoice can have its payment recorded by one Finance user (maker) with TDS auto-calculated, and confirmed by a *different* Finance user (checker) before it's treated as final — at which point the invoice becomes `Paid`, the UTR is permanently stored, and MSME due-date compliance is tracked throughout.

---

## 2. Assumptions / Scope Decisions (confirm with your manager)

- **No bank integration of any kind.** UTR is manually entered by the maker after the real-world transfer has already happened, not fetched from a bank API.
- **"Acceptance date" for the MSME 45-day rule** is assumed to be the date the invoice reached `Approved_For_Payment` (end of Phase 4A) — the SRS doesn't define "acceptance" precisely. Flag this to your manager; if "acceptance" should instead mean GRN date or invoice submission date, the due-date calculation changes.
- **"Bank rate" for late-payment interest** (bank rate + 3 percentage points) has no real data source. Implemented as a single configurable value (a settings row, e.g. `base_bank_rate`) that Admin can update manually — not fetched from any external rate feed.
- **Rejecting a payment record** requires the maker to submit a fresh record from scratch (no edit-in-place) — keeps the audit trail unambiguous about who recorded what.

---

## 3. Data Model

### 3.1 Extend `invoices` (from Phase 3B/4A) — add these fields
| Field | Type | Notes |
|---|---|---|
| payment_due_date | date, nullable | computed when status becomes `Approved_For_Payment` — see Section 5.5 |
| status | enum, extend existing | add `Paid` |

### 3.2 `payments`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| invoice_id | FK → invoices | must be `Approved_For_Payment` at creation time |
| gross_amount | decimal | copied from invoice's `total_invoice_amount` |
| tds_section | string | defaults from vendor/agreement; editable |
| tds_rate | decimal | defaults from section; editable |
| tds_amount | decimal | server-computed: gross × rate |
| net_payable_amount | decimal | server-computed: gross − tds |
| payment_mode | enum | `NEFT`, `RTGS`, `IMPS`, `UPI`, `Cheque` |
| company_bank_account | string | mandatory — which of JHS's accounts paid from |
| payment_date | date | mandatory — the real-world date the transfer happened |
| utr_reference | string | mandatory at maker entry (payment already happened per Section 1) |
| itc_eligible | boolean | set by the maker per SRS §10.2 |
| status | enum | `Maker_Recorded`, `Checker_Confirmed`, `Rejected` |
| initiated_by | FK → users | maker |
| initiated_at | timestamp | |
| confirmed_by | FK → users, nullable | checker — must differ from `initiated_by` |
| confirmed_at | timestamp, nullable | |
| rejection_reason | text, nullable | |

### 3.3 `tds_override_log`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| payment_id | FK → payments | |
| original_section, original_rate | — | the defaulted values before override |
| new_section, new_rate | — | what the maker changed them to |
| reason | text | mandatory |
| changed_by | FK → users | |
| changed_at | timestamp | |

### 3.4 `settings` (simple key-value, if you don't already have one)
| Field | Type | Notes |
|---|---|---|
| key | string, unique | e.g. `base_bank_rate` |
| value | string | |

---

## 4. Workflow

```
Invoice reaches Approved_For_Payment (Phase 4A) → payment_due_date computed (5.5)
                                                  → invoice appears in the payment queue

Finance (maker) records a payment against it → payments row, status Maker_Recorded
   (TDS auto-calculated; if overridden, tds_override_log entry created, reason mandatory)

A DIFFERENT Finance user (checker) reviews:
   Confirms → payments.status Checker_Confirmed, invoice.status Paid,
              invoice's UTR permanently associated, a notification/payment-advice
              entry logged (stub, same pattern as every prior phase's notification stubs)
   Rejects  → payments.status Rejected, invoice remains Approved_For_Payment,
              maker must submit a fresh payments row (no edit-in-place, see Section 2)
```

---

## 5. Business Rules

1. **Eligibility**: a payment can only be recorded against an invoice with status `Approved_For_Payment`.
2. **Maker ≠ Checker**: `initiated_by` and `confirmed_by` must be different users — hard block, no override, per the SRS's explicit "cannot be overridden" language.
3. **TDS calculation**: default section/rate pulled from the invoice's agreement/vendor; `tds_amount` and `net_payable_amount` always server-computed, never trust client-supplied values for these two fields.
4. **TDS override requires reason**: if the maker changes section or rate from the default, `tds_override_log` gets a row and a reason is mandatory.
5. **Payment due date** = `MIN(invoice_date + agreement.credit_period_days, payment_due_date_if_msme)`, where `payment_due_date_if_msme` = the date the invoice reached `Approved_For_Payment` + 45 days, and is only considered at all if `vendors.msme_status = true`. Compute and store this once, at the moment status becomes `Approved_For_Payment`.
6. **Queue priority**: the payment queue (Section 6) is sorted by `payment_due_date` ascending — this naturally implements "MSME due date takes precedence when it would be earlier."
7. **MSME at-risk/overdue flagging**: an invoice is "at risk" if `payment_due_date` is within 7 days and unpaid; "overdue" if past `payment_due_date` and unpaid. Both should be queryable (Section 6), and overdue-by-7+-days should log an alert notification to Finance Head/CFO-equivalent roles (stub).
8. **Late payment interest**: if `payments.payment_date` > the invoice's `payment_due_date`, compute interest as `net_payable_amount × (base_bank_rate + 3%) × (days late / 365)` and store/flag it on the payment record — this is a calculated flag for visibility, not an automatic deduction or additional payment action.
9. **One confirmed payment per invoice**: an invoice cannot have two `Checker_Confirmed` payments — block creating a new payment record if one is already confirmed.
10. **Mandatory fields**: `company_bank_account`, `payment_mode`, `payment_date`, `utr_reference` all required to create a payment record (per Section 1's reinterpretation — the payment already happened, so these aren't optional-until-later).

---

## 6. API Endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/api/v1/payments/queue` | `Approved_For_Payment` invoices, sorted by `payment_due_date` | Finance Team, Finance Head, System Admin |
| POST | `/api/v1/payments` | Record a payment (maker) | Finance Team, System Admin |
| GET | `/api/v1/payments/{id}` | View one payment record | Any authenticated with appropriate visibility |
| POST | `/api/v1/payments/{id}/confirm` | Confirm (checker) | Finance Team, Finance Head, System Admin (different user than maker) |
| POST | `/api/v1/payments/{id}/reject` | Reject (checker) | Finance Team, Finance Head, System Admin |
| GET | `/api/v1/payments/msme-alerts` | MSME invoices at-risk/overdue | Finance Team, Finance Head, System Admin |
| GET/POST | `/api/v1/settings/base-bank-rate` | Read/update the stubbed bank rate | GET: any authenticated; POST: System Admin |

---

## 7. Required Tests (automated, pytest + httpx)

1. `test_payment_blocked_if_invoice_not_approved_for_payment`
2. `test_tds_auto_calculated_from_default`
3. `test_tds_override_requires_reason_and_logs`
4. `test_net_payable_computed_correctly`
5. `test_maker_cannot_be_checker` — same user on both steps → 403
6. `test_checker_confirm_marks_invoice_paid`
7. `test_checker_reject_leaves_invoice_approved_for_payment`
8. `test_duplicate_confirmed_payment_blocked`
9. `test_queue_sorted_by_payment_due_date`
10. `test_msme_due_date_uses_earlier_of_credit_period_or_45_days`
11. `test_msme_alerts_flags_at_risk_and_overdue`
12. `test_late_payment_interest_flagged_when_paid_after_due_date`
13. `test_mandatory_fields_enforced` — missing UTR/bank account/mode → 422
14. `test_non_finance_role_blocked_from_recording_payment`

Run with: `pytest tests/ -v`. **All 14 must pass.**

---

## 8. Manual Verification

1. As Finance, open the payment queue — confirm an MSME vendor's invoice with an earlier effective due date sorts above a larger non-MSME invoice with a later one.
2. Record a payment against an `Approved_For_Payment` invoice, override the TDS rate with a reason — confirm `net_payable_amount` recalculates and the override is logged.
3. Try confirming as the same user who recorded it — confirm it's blocked.
4. Confirm as a different Finance user — confirm invoice status becomes `Paid` and the UTR is visible on the invoice.
5. Try recording a second payment against the same now-Paid invoice — confirm it's blocked.
6. Check `/payments/msme-alerts` with a seeded MSME invoice close to its due date — confirm it appears.
7. Record a payment with a `payment_date` after the computed due date — confirm the late-interest figure is calculated and shown somewhere on the record.

---

## 9. Explicitly Out of Scope for This Phase

No bank transfer execution or integration of any kind (Section 1). No automated interest deduction (interest is calculated/flagged only, per 5.8). No TDS return filing (Form 26Q) or TDS certificate (Form 16A) generation — those are MIS/compliance reporting concerns for Phase 5. No automatic invoice-to-payment matching beyond what's specified — the maker always explicitly selects the invoice.

---

## 10. Instructions for the Coding Agent

Build in order: Section 3 (models) → Section 4 (workflow) → Section 5 (business rules) → Section 6 (endpoints), testing continuously per Section 7. If anything in Section 2's assumptions conflicts with how Phase 4A actually ended up storing invoice status, flag it rather than guessing. Report which files were created/changed when done.
