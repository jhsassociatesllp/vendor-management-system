# VPMS — React Frontend Migration: Foundation, Architecture & Conversion Guide

**Project:** Vendor Payment Management System (VPMS)
**Scope:** Full frontend replacement — plain HTML/CSS/JS → React + TypeScript. **Backend is unchanged.** Every existing FastAPI endpoint across all prior phases stays exactly as-is; this is a client-side rewrite only.
**Rollout:** Full rebuild, single cutover — the old static site stays in place and untouched until the entire new React app passes the checklist in Section 8, then it's replaced wholesale, not page by page.

---

## 1. Objective

Replace the plain HTML/CSS/JS frontend with a React + TypeScript single-page application, using the existing FastAPI backend unchanged, while carrying forward (and elevating) the design language already established: the slate-blue/Manrope+Inter visual identity, the card/badge/timeline/budget-bar patterns from `tokens.css`/`components.css`.

**This document is the architecture and conversion guide, not a re-specification of every page.** For what each screen needs to contain (fields, flows, validations, role visibility), Claude Code should refer to the existing UI specs:
- `VPMS_Phase1_UI_Spec.md` (Vendor)
- `VPMS_Phase2B_UI_Spec.md` (Vendor Portal)
- `VPMS_Phase3_UI_Spec.md` (PO/Invoice)
- `VPMS_Phase4_UI_Spec.md` (Approval/Payment)
- `VPMS_Phase5_UI_Spec.md` (MIS/Reports/Audit)

Every page/screen described in those five documents gets rebuilt in React per the patterns in this document — this guide tells you *how*, those five tell you *what*.

---

## 2. Tech Stack

- **Build tool**: Vite (React + TypeScript template)
- **Routing**: `react-router-dom` v6
- **Data fetching / server state**: `@tanstack/react-query` — every API call goes through a query/mutation hook, never a raw `fetch()` in a component
- **Forms**: `react-hook-form` + `zod` for schema validation — this replaces every inline "show error near field" pattern from the old JS with proper form-level validation
- **Styling**: Tailwind CSS
- **Component library**: `shadcn/ui` (Radix primitives + Tailwind) — use its `Button`, `Card`, `Badge`, `Dialog`, `AlertDialog`, `Toast` (via `sonner`), `Table`, `Tabs`, `Select`, `Input`, `Textarea`, `Checkbox` as the base for everything; don't hand-build primitives shadcn already provides
- **Tables**: `@tanstack/react-table` wrapped in shadcn's `Table` — powers every list/report screen (sorting, filtering, pagination in one consistent place)
- **Charts**: `recharts` (replaces the old Chart.js CDN usage from Phase 5 UI)
- **Icons**: `lucide-react` (shadcn's default icon set)

---

## 3. Project Structure

```
vpms-frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # router setup
│   ├── lib/
│   │   ├── api-client.ts          # typed fetch wrapper, attaches JWT, handles 401/403
│   │   └── utils.ts
│   ├── theme/
│   │   └── tokens.ts              # source of truth for design tokens (see Section 4)
│   ├── contexts/
│   │   └── AuthContext.tsx        # current user, role, login/logout, session_version handling
│   ├── components/
│   │   ├── ui/                    # shadcn-generated primitives — don't hand-edit these much
│   │   └── shared/                # this project's composed components (Section 6)
│   ├── features/                  # one folder per SRS module, mirrors the UI specs
│   │   ├── auth/
│   │   ├── vendor/
│   │   ├── vendor-portal/
│   │   ├── procurement/
│   │   ├── approvals/
│   │   ├── payments/
│   │   └── mis/
│   ├── hooks/                     # shared React Query hooks (useInvoices, usePOs, etc.)
│   └── routes/                    # route-level components, one per page from the old spec docs
├── tailwind.config.ts
└── package.json
```

`features/` folders mirror the old spec docs exactly (`vendor` = Phase 1, `vendor-portal` = Phase 2B, `procurement` = Phase 3, `approvals`+`payments` = Phase 4, `mis` = Phase 5) — this makes it easy to cross-reference "which spec does this folder implement."

---

## 4. Design Token Migration

Convert `tokens.css`'s CSS custom properties directly into `tailwind.config.ts`'s `theme.extend`:

```ts
// tailwind.config.ts (excerpt — use the ACTUAL values from the existing tokens.css, this is illustrative)
colors: {
  primary: { DEFAULT: '#2B4570', hover: '#1F3355' },
  surface: '#FFFFFF',
  background: '#F5F7FA',
  success: { DEFAULT: '#1B7F5C', bg: '#E6F4EF' },
  warning: { DEFAULT: '#B7791F', bg: '#FBF0DD' },
  danger:  { DEFAULT: '#B42318', bg: '#FDECEA' },
},
fontFamily: {
  heading: ['Manrope', 'sans-serif'],
  body: ['Inter', 'sans-serif'],
},
```

Configure shadcn/ui's theme to use these same tokens (shadcn uses CSS variables under the hood — point its variables at the same values) so shadcn's default components inherit the existing palette rather than looking like an unstyled library default.

**Do not invent new colors or fonts during this migration.** If a screen seems to need one, flag it — the whole point of migrating is consistency, not a redesign of the visual identity.

---

## 5. Core Architecture

### 5.1 Auth
`AuthContext` holds: current user, role, JWT. On app load, validate the stored token (or redirect to login). Every API call goes through `api-client.ts`, which attaches `Authorization: Bearer <token>` and handles 401 (clear token, redirect to login) — same behavior as the old `api.js`, just centralized properly instead of copy-pasted per page.

Respect the **session_version single-session enforcement** from Phase 2B's backend — if a request comes back indicating the token's session is invalid, treat it identically to a 401.

### 5.2 Routing & Role Guards
A `ProtectedRoute` wrapper component checks the current user's role against each route's allowed roles (derived from the "Access" column in each backend spec's endpoint table) and redirects or shows a clear "not authorized" state rather than a blank page. Route structure should mirror the page list in each UI spec — every `.html` file becomes one route.

### 5.3 Data Fetching
One React Query hook per resource (e.g. `useVendorRequests()`, `usePurchaseOrders(filters)`, `useInvoice(id)`), living in `hooks/` or colocated in the relevant `features/` folder. Mutations (create/approve/reject/etc.) use `useMutation` with automatic query invalidation so lists refresh after an action — this is a real upgrade over the old plain-JS version, which required manual page reloads or explicit re-fetch calls after every action.

### 5.4 Global Layout
One `AppShell` component (sidebar nav + top bar with user info and notification bell) wrapping every authenticated route, with the sidebar's visible links computed from the current user's role — same logic as the old per-page "show this nav link only for role X" pattern, but computed once in the shell instead of duplicated across pages.

---

## 6. Shared Component Library (build these before any page)

Each of these replaces a pattern that was previously hand-coded per page across the five old UI specs — build once, use everywhere:

| Component | Replaces (from old specs) |
|---|---|
| `<StatusBadge status={...} />` | The colored pill status badges used everywhere (request status, PO status, invoice status, payment status) |
| `<ProgressRing percent={...} />` | Phase 2B's KYC completion ring |
| `<BudgetBar committed={...} sanctioned={...} />` | Phase 3 UI's budget utilization bar |
| `<WorkflowTimeline stages={...} currentStage={...} />` | Phase 4 UI's L1→L4→Payment timeline — including its skipped/query/rejected states |
| `<DataTable columns={...} data={...} />` | Every list/report table across every phase — sortable, filterable, paginated, generic like Phase 5's `report-viewer.html` was meant to be |
| `<ConfirmDialog />` | The "deliberate confirm" patterns (vendor PO acknowledgement, bank-change approval) — use shadcn's `AlertDialog` |
| `<MultiStepForm />` | Phase 3's invoice submission form, Phase 2B's OTP login — a reusable stepper wrapper |
| `<FileUploadField />` | KYC documents, invoice documents — consistent upload UI with status feedback |
| `<DisabledActionTooltip reason={...} />` | The "you already approved this" / "you can't confirm your own payment" disabled-button-with-explanation pattern used repeatedly in Phase 2B/4 |
| `<EmptyState />` | Every "no results" case — give this real thought, it's an easy place to feel unpolished if skipped |

**This is where "interactive and user-friendly" actually gets won or lost.** A few concrete upgrades to build into these from the start, since React makes them easy where plain JS made them tedious:
- Toast notifications (via `sonner`) for every action's success/failure, replacing static inline banners
- Optimistic UI updates on actions where it's safe (e.g. marking a notification read) — instant feedback, reconciled by React Query in the background
- Skeleton loading states instead of blank screens while data fetches
- Debounced search/filter inputs on every list screen instead of requiring an explicit "search" button click

---

## 7. Page Inventory (build checklist — every route needed)

Use this as the literal checklist for "is the rebuild complete." Cross-reference each row's detail against the named spec section.

**Auth/Shell:** Login, OTP verify (internal login has no OTP; vendor login does, per Phase 2B UI §3.1), AppShell/Dashboard shell

**Vendor (Phase 1 UI §4):** vendor-request-form, vendor-requests-list, request-detail, item-codes

**Vendor Portal (Phase 2B UI §3-3.7):** vendor-login, vendor-dashboard, vendor-kyc-upload, vendor-bank-change, vendor-notifications, kyc-review-queue, bank-change-review

**Procurement (Phase 3 UI §3-4):** budget-heads, po-create, po-list, po-detail, invoices-list (internal), invoice-detail (internal), vendor-po-list, vendor-invoice-submit, vendor-invoices-list

**Approvals/Payment (Phase 4 UI §3-5):** my-approval-queue, invoice-approval-detail, delegation-setup, doa-matrix, escalations, payment-queue, payment-record-form, payment-confirm-queue, msme-alerts, vendor-invoice-track

**MIS (Phase 5 UI §3):** mis-dashboard, reports (grid), report-viewer (generic, all 11 report types), audit-trail

---

## 8. Verification Approach (given single-cutover rollout)

Since this is a build-all-then-switch rollout rather than incremental, verification must be systematic rather than "test as you go module by module in production." Work through this order:

1. **Foundation first**: get login (both internal and vendor OTP flow) plus the AppShell with correct role-based nav working end-to-end before building any feature page. This alone should be checkable against Phase 0 and Phase 2B's login behavior.
2. **Component library second**: sanity-check each shared component (Section 6) in isolation with a few hardcoded prop combinations (e.g. WorkflowTimeline with a skipped stage, with a rejected stage) before wiring any of them to real data.
3. **Pages, module by module, internally** (even though the user won't see/deploy them individually) — following the Page Inventory order in Section 7. For each module, **re-run that module's original "Manual Test Script"** from its corresponding old UI spec (Phase 1 UI §Manual Test Script, Phase 2B UI §5, Phase 3 UI §6, Phase 4 UI §7, Phase 5 UI §5) against the new React pages — the steps are identical, only the pages under test have changed. This is the real regression check: since the backend hasn't moved, every one of those old manual scripts should still pass step-for-step against the new UI.
4. **Full end-to-end walkthrough** once every module's script passes: vendor onboarding → agreement → PO → invoice → approval → payment → MIS reporting, using the new UI exclusively, start to finish.
5. Only after step 4 passes completely does the old static site get replaced.

---

## 9. Explicitly Out of Scope

No backend changes of any kind. No new features beyond what the five existing UI specs already describe — this is a re-platform for quality/interactivity, not a scope expansion. No mobile app (still a responsive web app). No changes to API contracts — if the React version seems to need a backend change, flag it rather than adding one silently, since it would affect the already-tested API surface.

---

## 10. Instructions for the Coding Agent

Build in this order: Section 2-3 (project setup) → Section 4 (design tokens) → Section 5 (auth/routing/data-fetching architecture) → Section 6 (shared component library, sanity-checked in isolation) → Section 7's pages, module by module, running each module's corresponding old manual test script (Section 8, step 3) against the new pages before moving to the next module. Do not skip ahead to later modules before earlier ones have passed their script — even though nothing is deployed until the very end, building in this order surfaces architecture problems (in routing, auth, or the shared component library) early, while they're still cheap to fix, rather than after 30 pages have been built on top of a flawed foundation. Report progress module by module, and give a final full report against Section 7's complete checklist when done.
