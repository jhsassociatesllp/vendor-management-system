# VPMS — Phase 3A: Purchase Order Management, Budget Control & GRN/SCN (Backend)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 3A of 6 — Procurement, backend only (SRS Module 5)
**Builds on:** Phase 1 (Vendor, Item Codes, Vendor-Item combos), Phase 2A (Agreements, Rate Cards). Reuse existing models — do not modify them.
**Rule for this phase: build ONLY what is listed below. No Invoice submission (that's Phase 3B, right after this), no parameterised DoA approval engine, no Payment.**

---

## 1. Objective

Implement Purchase Order creation with hard budget enforcement, PO approval, amendments with versioning, vendor acknowledgement, and GRN/SCN (delivery/completion confirmation) — the foundation Invoice submission (Phase 3B) will validate against via three-way matching.

**Definition of Done:** A PO can only be created when an active vendor-item combination, an active agreement, and sufficient budget all exist. Budget is committed on approval and released on cancellation. Amendments require fresh approval. GRN/SCN entries track delivered quantity against the PO, supporting partial deliveries. All tests in Section 7 pass.

---

## 2. Assumptions Added Beyond the SRS (confirm with your manager if these matter)

- **PO approval workflow is a placeholder.** The SRS specifies PO approval follows the DoA matrix from Module 7 (Parameterised Approval Workflow), which isn't built yet. This phase uses a simple fixed approval: **Budget Controller or Partner/VP** approves; this will be replaced by the real configurable engine in Phase 4 — don't treat this approval logic as final.
- **"CFO" role**: your seeded roles (Phase 0) don't include a separate CFO — over-budget exception approval is granted to **Budget Controller** or **System Admin** for now. Flag this to your manager if CFO needs to be a distinct role later.
- **Available budget formula, this phase only**: `Sanctioned Amount − Committed (active POs)`. The full SRS formula also subtracts "Invoices Paid (actuals)," which doesn't exist until Phase 4 (Payment). This phase's budget check is therefore necessary-but-not-final — it will need revisiting once actuals exist.

---

## 3. Data Model

### 3.1 `budget_heads`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| department | string | |
| cost_centre | string | |
| period_type | enum | `Monthly`, `Quarterly`, `Annual` |
| period_label | string | e.g. `FY2026-Q1` |
| sanctioned_amount | decimal | mandatory |
| created_at | timestamp | |

### 3.2 `purchase_orders`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| po_number | string, unique | format `PO-YYYY-NNNN`, auto-generated, sequence never reused |
| version | integer | starts at 1, incremented on each amendment |
| vendor_id | FK → vendors | |
| item_code_id | FK → item_codes | must match an active `vendor_item_codes` combo |
| agreement_id | FK → agreements | must be `Active` and cover this item code |
| description | text | mandatory |
| quantity | decimal | mandatory |
| unit | string | from rate card's unit |
| rate | decimal | defaults from active Rate Card; if overridden, `rate_override_reason` mandatory |
| rate_override_reason | text, nullable | |
| po_value_excl_gst | decimal | server-computed: quantity × rate — never trust a client-supplied value |
| gst_amount | decimal | server-computed from agreement's `gst_rate` |
| total_po_value_incl_gst | decimal | server-computed |
| budget_head_id | FK → budget_heads | |
| delivery_completion_date | date | mandatory |
| po_validity_date | date | mandatory |
| po_date | date | always system date at creation — never client-supplied, never backdateable |
| status | enum | `Pending_Approval`, `Approved`, `Vendor_Acknowledged`, `Cancelled`, `Lapsed`, `Closed` |
| vendor_acknowledged_at | timestamp, nullable | |
| over_budget_justification | text, nullable | required only if this PO was approved as an over-budget exception |
| created_at | timestamp | |

### 3.3 `po_amendments`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| po_id | FK → purchase_orders | |
| previous_quantity, previous_rate, previous_delivery_date | — | snapshot of what changed |
| new_quantity, new_rate, new_delivery_date | — | |
| reason | text | mandatory |
| status | enum | `Pending_Approval`, `Approved`, `Rejected` |
| requested_by | FK → users | |
| approved_by | FK → users, nullable | |
| created_at | timestamp | |

### 3.4 `budget_commitments`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| budget_head_id | FK → budget_heads | |
| po_id | FK → purchase_orders | |
| committed_amount | decimal | |
| is_released | boolean | default false; true when PO cancelled |
| created_at | timestamp | |

### 3.5 `grn_scn`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| po_id | FK → purchase_orders | |
| type | enum | `GRN` (goods), `SCN` (service) |
| quantity_confirmed | decimal | this delivery/confirmation's quantity, not cumulative |
| description | text | mandatory |
| created_by | FK → users | Dept. Manager or higher |
| created_at | timestamp | |

---

## 4. Workflows

### 4.1 PO Creation → Approval
```
Dept. Manager or Accounts Executive creates PO → status Pending_Approval
   (system checks: active vendor-item combo? active covering agreement? budget available?)
   → if budget insufficient: HARD BLOCK unless the creator explicitly requests an
     over-budget exception (sets `over_budget_justification`) — even then, the PO
     still requires the approval step below; it is not auto-approved
Budget Controller or Partner/VP approves → status Approved, budget_commitments row created,
                                             committed_amount subtracted from available budget
                                          → rejects → PO stays Pending_Approval or moves to
                                             a terminal rejected state (implementer's choice,
                                             but must be clearly distinguishable from Cancelled)
```

### 4.2 Vendor Acknowledgement
```
Vendor (portal, own PO only) acknowledges an Approved PO → status Vendor_Acknowledged,
   vendor_acknowledged_at set
```
This is a hard precondition for Invoice submission in Phase 3B — not enforced here, just recorded here.

### 4.3 Amendment
```
Requester proposes amendment (qty/rate/date change) → po_amendments row, status Pending_Approval
Budget Controller or Partner/VP approves → PO's version increments, fields updated,
                                            PO status reset to Pending_Approval again
                                            (must go through approval again per SRS §7.3)
   → rejects → amendment Rejected, PO unchanged
```

### 4.4 Cancellation
```
Accounts Executive/Admin cancels a PO (Approved or earlier) → status Cancelled,
   any associated budget_commitments row set is_released=true
```

---

## 5. Business Rules

1. **PO creation preconditions (all three required)**: active vendor-item combo (Phase 1) + active agreement covering that item (Phase 2A) + sufficient budget. Missing any → reject with a specific error identifying which precondition failed.
2. **PO Number**: `PO-{year}-{4-digit sequence}`, unique, never reused.
3. **No backdating**: `po_date` is always today's date server-side; ignore any client-supplied date for this field.
4. **Rate defaulting**: pull the active Rate Card rate for (vendor, item, agreement); if the caller supplies a different rate, `rate_override_reason` becomes mandatory.
5. **Server-computed values**: `po_value_excl_gst`, `gst_amount`, `total_po_value_incl_gst` are always computed server-side from quantity/rate/agreement's gst_rate — reject or ignore any client-supplied totals.
6. **Budget hard block**: reject PO creation if `total_po_value_incl_gst` > available budget for that budget head, unless an over-budget exception is explicitly requested (still requires approval — see 4.1).
7. **Budget commit/release**: committing happens on approval, not on creation; releasing happens on cancellation.
8. **Amendment triggers re-approval**: any change to quantity, rate, or delivery date must go through the amendment + approval flow, never a direct edit.
9. **GRN/SCN cumulative check**: sum of `quantity_confirmed` across all GRN/SCN rows for a PO must not exceed the PO's `quantity`. Partial GRNs (multiple rows) are allowed.
10. **Vendor acknowledgement ownership**: a vendor user can only acknowledge POs tied to their own `linked_vendor_id`.

---

## 6. API Endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/api/v1/budget-heads` | Create a budget head | Budget Controller, System Admin |
| GET | `/api/v1/budget-heads` | List budget heads | Any authenticated |
| GET | `/api/v1/budget-heads/{id}/availability` | Available budget for this head | Any authenticated |
| POST | `/api/v1/purchase-orders` | Create a PO | Dept. Manager, Accounts Executive, System Admin |
| GET | `/api/v1/purchase-orders` | List POs | Any authenticated |
| GET | `/api/v1/purchase-orders/{id}` | View one PO | Any authenticated |
| POST | `/api/v1/purchase-orders/{id}/approve` | Approve PO | Budget Controller, Partner/VP, System Admin |
| POST | `/api/v1/purchase-orders/{id}/reject` | Reject PO | Budget Controller, Partner/VP, System Admin |
| POST | `/api/v1/purchase-orders/{id}/cancel` | Cancel PO, release budget | Accounts Executive, System Admin |
| POST | `/api/v1/purchase-orders/{id}/amend` | Propose an amendment | Dept. Manager, Accounts Executive, System Admin |
| POST | `/api/v1/po-amendments/{id}/approve` | Approve amendment | Budget Controller, Partner/VP, System Admin |
| POST | `/api/v1/purchase-orders/{id}/vendor-acknowledge` | Vendor acknowledges the PO | Vendor (own only) |
| POST | `/api/v1/purchase-orders/{id}/grn` | Record a GRN/SCN entry | Dept. Manager, Accounts Executive, System Admin |
| GET | `/api/v1/purchase-orders/{id}/grn` | List GRN/SCN entries for a PO | Any authenticated |

---

## 7. Required Tests (automated, pytest + httpx)

1. `test_po_blocked_without_active_vendor_item_combo`
2. `test_po_blocked_without_active_agreement`
3. `test_po_blocked_when_budget_insufficient`
4. `test_po_over_budget_exception_still_requires_approval` — creating with justification doesn't auto-approve
5. `test_po_number_format`
6. `test_po_date_always_system_date` — supplying a past/future date is ignored, `po_date` is today
7. `test_po_rate_override_requires_reason`
8. `test_po_totals_are_server_computed` — client-supplied totals are ignored/recomputed
9. `test_po_approval_commits_budget` — available budget decreases by the PO's total after approval
10. `test_po_cancellation_releases_budget` — available budget restored after cancelling an approved PO
11. `test_po_amendment_requires_fresh_approval` — amendment approval resets status to require approval again, increments version
12. `test_grn_cumulative_cannot_exceed_po_quantity`
13. `test_partial_grn_supported` — two GRN rows summing correctly, neither individually exceeding PO quantity
14. `test_vendor_acknowledge_blocked_for_other_vendor` — vendor B cannot acknowledge vendor A's PO → 403

Run with: `pytest tests/ -v`. **All 14 must pass.**

---

## 8. Manual Verification

1. As Budget Controller, create a budget head with a sanctioned amount.
2. As Dept. Manager, try creating a PO against a vendor/item/agreement combo where the PO value exceeds available budget — confirm hard block.
3. Create a valid PO within budget — confirm `Pending_Approval`.
4. As Budget Controller, approve it — confirm available budget on the budget head decreases correctly.
5. As Accounts Executive, cancel the PO — confirm available budget is restored.
6. Create another valid PO, approve it, then propose an amendment (change quantity) — confirm it requires a fresh approval before taking effect.
7. As the vendor tied to that PO, acknowledge it via the portal — confirm status updates.
8. Record two partial GRN entries against it, confirm cumulative tracking, and confirm a third GRN that would exceed PO quantity is blocked.

---

## 9. Explicitly Out of Scope for This Phase

No Invoice submission (Phase 3B, next), no parameterised DoA engine (Phase 4 — this phase's approval is a placeholder per Section 2), no Payment processing, no MIS. PO "Lapsed" status (validity date passed, unused) can be modeled as a field/enum value but doesn't need an automated job to set it in this phase — flag it as a manual/future automation concern rather than building a scheduler.

---

## 10. Instructions for the Coding Agent

Build in order: Section 3 (models) → Section 4 (workflows) → Section 5 (business rules) → Section 6 (endpoints), testing continuously per Section 7. This phase has more interdependent state than previous ones (budget commitments tied to PO status tied to amendments) — if any test in Section 7 requires a design decision not spelled out above, flag it rather than guessing silently. Report which files were created/changed when done.
