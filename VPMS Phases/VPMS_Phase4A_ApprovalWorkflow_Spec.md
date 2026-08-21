# VPMS — Phase 4A: Parameterised Invoice Approval Workflow (Backend)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 4A of 6 — Approvals & Finance, backend only (SRS Module 7, plus the DoA matrix from SRS §2.2)
**Builds on:** Phase 3B (Invoices, status `Submitted`). Reuse existing models — do not modify Phase 3B's tested submit logic; this phase adds a new explicit routing step on top of it instead of changing what already works.
**Rule for this phase: build ONLY what is listed below. Actual payment initiation/maker-checker/TDS is Phase 4B, right after this.**

---

## 1. Objective

Take a `Submitted` invoice and route it through the correct sequence of approval stages (L1 Accounts → L2 Dept. Manager → L3 Partner/VP → L4 Finance) based on a configurable amount-slab matrix, with query-raising, vendor response, delegation, and escalation-visibility all working per the SRS.

**Definition of Done:** An invoice can be routed into approval, correctly skips L2/L3 for small amounts per the slab matrix, moves through each required stage only via the correctly-authorized role, supports a query being raised and answered without losing its place in the workflow, and reaches `Approved_For_Payment` (or a terminal rejected/returned state) correctly. All tests in Section 7 pass.

---

## 2. Assumptions / Scope Decisions (confirm with your manager)

- **Routing is amount-slab only.** The SRS says routing can also depend on department and vendor category "simultaneously" with amount — that's a materially larger rules engine. This phase implements only the amount-slab matrix (SRS §2.2's indicative table, stored as a configurable master). Department/vendor-category-based routing is flagged as a future enhancement, not built here.
- **L5 "Payment Processing" is NOT part of this phase.** Module 7's stage table lists L5 as a Finance Executive action, but this overlaps with Module 8's maker-checker control. This phase stops at **L4 — "Approve for Payment"**, which sets the invoice ready for the Phase 4B payment queue. Treat L4's outcome as the handoff point.
- **Escalation is stub/queryable, not an automated background job.** Same pattern as Phase 2A's agreement-expiry alerts and Phase 1's notification stubs — a correctly-computed query endpoint exists, but there's no real scheduler running it periodically yet.
- **Delegation does not enforce that the delegate holds the same role as the delegator.** The SRS says delegated authority "retains the same DoA limits" but doesn't say the delegate must already hold that role — implemented as: any user can be named a delegate, and while the delegation is active they can act on that specific delegator's pending items.

---

## 3. Data Model

### 3.1 `doa_matrix` (configurable master, seed with the SRS's indicative slabs)
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| min_amount | decimal | inclusive |
| max_amount | decimal, nullable | inclusive; null = no upper bound |
| requires_l2 | boolean | |
| requires_l3 | boolean | |
| l1_role | string | always `Accounts Executive` per SRS, but kept configurable |
| l2_role | string, nullable | `Dept. Manager` when required |
| l3_role | string, nullable | `Partner / VP` when required (SRS's ">₹10L" slab technically says "Partner + CFO" — for this phase, model that as a single `l3_role` of `Partner / VP`, and flag the CFO co-approval nuance as unimplemented) |
| l4_role | string | `Finance Head` or `Finance Team` depending on slab — keep configurable per row |
| l1_tat_days, l2_tat_days, l3_tat_days, l4_tat_days | integer | business days, defaults per SRS §9.1 (1, 2, 2, 1) |

Seed rows matching SRS §2.2's four indicative slabs (≤50k, 50k–2L, 2L–10L, >10L).

### 3.2 Extend `invoices` (from Phase 3B) — add these fields
| Field | Type | Notes |
|---|---|---|
| status | enum, extend existing | add: `L1_Verification`, `L2_Review`, `L3_Approval`, `L4_Finance_Approval`, `Approved_For_Payment`, `Query_Raised`, `Returned_To_Vendor`, `Rejected`, `On_Hold` |
| doa_matrix_id | FK → doa_matrix, nullable | set when routed |

### 3.3 `invoice_approvals`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| invoice_id | FK → invoices | |
| level | enum | `L1`, `L2`, `L3`, `L4` |
| assigned_role | string | copied from the matched `doa_matrix` row |
| status | enum | `Pending`, `Verified`/`Approved` (use one consistent value per level — e.g. `Completed`), `Rejected`, `Returned`, `Query_Raised`, `Skipped` (for L2/L3 when not required by the slab) |
| action_taken_by | FK → users, nullable | |
| action_at | timestamp, nullable | |
| comments | text, nullable | |
| tat_due_at | timestamp | computed from stage start + configured TAT business days |
| tat_paused | boolean | default false; true while a query is open at this stage |
| created_at | timestamp | |

### 3.4 `invoice_queries`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| invoice_id | FK → invoices | |
| raised_at_level | enum | `L1`–`L4` |
| raised_by | FK → users | |
| query_text | text | mandatory |
| status | enum | `Open`, `Responded` |
| vendor_response | text, nullable | |
| responded_at | timestamp, nullable | |
| created_at | timestamp | |

### 3.5 `approval_delegations`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| delegator_user_id | FK → users | |
| delegate_user_id | FK → users | |
| valid_from | date | |
| valid_to | date | |
| created_by | FK → users | usually the delegator themself, or System Admin for emergency delegation |
| created_at | timestamp | |

---

## 4. Workflows

### 4.1 Routing (new explicit step — does not touch Phase 3B)
```
Accounts Executive (or Admin) calls route-for-approval on a Submitted invoice
   → system finds the matching doa_matrix row by invoice total
   → creates invoice_approvals rows: L1 always Pending; L2/L3 Pending if required by
     the matched row, else Skipped; L4 always Pending (created now but only becomes
     actionable once L1-L3 complete — see 4.2)
   → invoice.status = L1_Verification, doa_matrix_id set
```

### 4.2 Sequential Approval
```
L1 (Accounts Executive) acts:
   Verify → L2 required? go to L2_Review : go to L4_Finance_Approval (skip to L4)
   Return_To_Vendor → invoice status Returned_To_Vendor (see 4.4 for resubmission)
   Reject → invoice status Rejected (terminal)
   Raise_Query → see 4.3

L2 (Dept. Manager) acts (only if not Skipped):
   Approve → L3 required? go to L3_Approval : go to L4_Finance_Approval
   Return_To_Accounts → back to L1_Verification (L1 row reset to Pending)
   Reject → Rejected
   Raise_Query → see 4.3

L3 (Partner/VP) acts (only if not Skipped):
   Approve → go to L4_Finance_Approval
   Reject → Rejected
   Raise_Query → see 4.3

L4 (Finance Head/Team) acts:
   Approve_For_Payment → invoice status Approved_For_Payment (Phase 4B picks it up from here)
   Hold → On_Hold (can be released back to L4_Finance_Approval via the same action endpoint)
   Reject → Rejected
```
Only the role assigned to the currently-pending stage (or their active delegate, per 4.5) may act.

### 4.3 Query Management
```
Any approver at the currently-active level raises a query → that stage's invoice_approvals
   row: status Query_Raised, tat_paused=true; invoice.status = Query_Raised;
   an invoice_queries row created with raised_at_level
Vendor responds via POST .../respond → invoice_queries row: status Responded,
   vendor_response saved → invoice re-enters the SAME level it was raised at,
   that stage's invoice_approvals row back to Pending, invoice.status back to
   that level's status (e.g. L2_Review), tat_paused=false (TAT clock conceptually
   resumes — recompute tat_due_at from now + remaining TAT, or simply reset it;
   pick one and be consistent)
```

### 4.4 Return-to-Vendor Resubmission
```
Vendor calls resubmit on a Returned_To_Vendor invoice (after making corrections via
   normal invoice edit — note: this phase doesn't need to rebuild invoice editing,
   just accept the resubmit call) → invoice status back to Submitted → must be
   routed again via route-for-approval (don't auto-skip routing)
```

### 4.5 Delegation Resolution
```
When checking whether the current user may act on a Pending stage:
   allowed if current_user.id == the role-holder acting normally (any user
     holding the assigned_role), OR
   allowed if an approval_delegations row exists where delegate_user_id ==
     current_user AND today is within [valid_from, valid_to] AND
     delegator_user_id holds the assigned_role
```

---

## 5. Business Rules

1. **Slab matching**: exactly one `doa_matrix` row must match a given invoice total (validate seed data has no gaps/overlaps); routing fails clearly if no match is found.
2. **Skip logic**: L2/L3 stages not required by the matched slab are created as `Skipped`, never `Pending` — they should never appear in anyone's action queue.
3. **Role gating**: only a user holding the stage's `assigned_role` (or an active delegate, per 4.5) can act on it — everyone else gets 403.
4. **Terminal states**: `Rejected` and `Approved_For_Payment` cannot be acted on further through this phase's endpoints.
5. **Query pauses, doesn't reset**: a query does not restart the whole workflow — it returns to exactly the level it was raised at, not to L1.
6. **TAT computed on stage entry**: `tat_due_at` is set when a stage becomes `Pending`, using that level's configured TAT in business days (weekends excluded — implement a simple business-day adder, doesn't need to account for holidays in this phase).

---

## 6. API Endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/api/v1/doa-matrix` | Create/update a slab row | System Admin |
| GET | `/api/v1/doa-matrix` | List current matrix | Any authenticated |
| POST | `/api/v1/invoices/{id}/route-for-approval` | Route a Submitted invoice into L1 | Accounts Executive, System Admin |
| GET | `/api/v1/invoice-approvals/my-queue` | Pending stages assigned to the current user's role (incl. active delegations) | Any authenticated |
| GET | `/api/v1/invoice-approvals/{id}` | View one approval stage | Any authenticated |
| POST | `/api/v1/invoice-approvals/{id}/action` | Take an action (Verify/Approve/Reject/Return/Hold, per level) | Role matching the stage (or delegate) |
| POST | `/api/v1/invoices/{id}/queries` | Raise a query | Role matching the current active stage |
| POST | `/api/v1/invoices/{id}/queries/{query_id}/respond` | Vendor responds | Vendor (own invoice only) |
| POST | `/api/v1/invoices/{id}/resubmit` | Vendor resubmits after Returned_To_Vendor | Vendor (own only) |
| POST | `/api/v1/approval-delegations` | Create a delegation | Any approver role (self) or System Admin (emergency) |
| GET | `/api/v1/invoice-approvals/escalations` | List TAT-breached pending stages | Accounts Executive, Partner/VP, Finance, System Admin |

---

## 7. Required Tests (automated, pytest + httpx)

1. `test_routing_selects_correct_slab_low_amount` — ≤₹50k invoice → L2/L3 both `Skipped`
2. `test_routing_selects_correct_slab_high_amount` — >₹10L invoice → L2/L3 both `Pending`
3. `test_l1_verify_skips_to_l4_when_l2_l3_skipped`
4. `test_l1_verify_advances_to_l2_when_required`
5. `test_l1_reject_is_terminal`
6. `test_l1_return_to_vendor_sets_status`
7. `test_action_blocked_for_wrong_role` — e.g. Dept. Manager trying to act on a Pending L1 stage → 403
8. `test_l2_return_to_accounts_resets_l1`
9. `test_l4_approve_for_payment_sets_final_status`
10. `test_query_raised_pauses_and_preserves_level` — query at L2 → invoice status Query_Raised, still tied to L2
11. `test_query_response_re_enters_same_level` — vendor responds → back to L2_Review, not L1
12. `test_query_response_blocked_for_wrong_vendor`
13. `test_resubmission_requires_fresh_routing` — resubmitted invoice is `Submitted`, not auto-routed
14. `test_delegate_can_act_within_valid_dates`
15. `test_delegate_blocked_outside_valid_dates`
16. `test_escalations_endpoint_flags_breached_tat` — seed an approval with a past `tat_due_at`, confirm it appears

Run with: `pytest tests/ -v`. **All 16 must pass.**

---

## 8. Manual Verification

1. As Accounts Executive, route a small (≤₹50k) invoice from Phase 3B — confirm L2/L3 show `Skipped` and it lands directly with L1 pending.
2. Verify at L1 — confirm it jumps straight to L4 (not L2).
3. Route a large (>₹10L) invoice — confirm L2 and L3 are both `Pending`.
4. Walk it through L1 → L2 → L3 → L4 with the correct role logged in at each step; confirm a wrong-role user is blocked at each stage.
5. On a different invoice, raise a query at L2 — confirm invoice status becomes `Query_Raised`.
6. As the vendor, respond to the query — confirm it returns to `L2_Review`, not back to L1.
7. Set up a delegation from a Dept. Manager to another user for a date range including today — confirm the delegate can act on that Dept. Manager's pending L2 item.
8. Check `/invoice-approvals/escalations` after manually backdating a test approval's `tat_due_at` — confirm it shows up.

---

## 9. Explicitly Out of Scope for This Phase

No payment initiation, no maker-checker, no TDS calculation, no MSME payment-timeline dashboard (Phase 4B). No department/vendor-category-based routing (Section 2). No automated background escalation job (Section 2 — endpoint only). No CFO co-approval nuance on the >₹10L slab (modeled as a single L3 approver for now — flag to your manager).

---

## 10. Instructions for the Coding Agent

Build in order: Section 3 (models, including the `invoices` status extension) → Section 4 (workflows) → Section 5 (business rules) → Section 6 (endpoints), testing continuously per Section 7. This phase has the most branching logic yet (skip logic, query pause/resume, delegation) — if any test needs a design decision not covered above, flag it rather than guessing. Report which files were created/changed when done.
