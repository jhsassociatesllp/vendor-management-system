from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope

from app.api.v1 import (
    agreements,
    approval_delegations,
    audit_logs,
    auth,
    bank_change_requests,
    budget_heads,
    doa_matrix,
    invoice_approvals,
    invoices,
    item_codes,
    kyc_documents,
    mis,
    notifications,
    payments,
    po_amendments,
    purchase_orders,
    rate_card_amendments,
    rate_cards,
    reports,
    settings,
    users,
    vendor_portal,
    vendor_requests,
    vendors,
)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
FRONTEND_DIST_DIR = BASE_DIR.parent / "vpms-frontend" / "dist"


class NoCacheStaticFiles(StaticFiles):
    """Forces revalidation on every request for static JS/CSS/HTML.

    Without this, browsers cache these aggressively by default and can keep serving a
    stale copy of a page's script/stylesheet after a deploy until the user hard-refreshes
    — this bit us during development (edits weren't showing up) and would bite real users
    identically after any future update to these files.
    """

    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


app = FastAPI(title="VPMS", version="0.1.0")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(vendor_requests.router)
app.include_router(vendors.router)
app.include_router(item_codes.router)
app.include_router(agreements.router)
app.include_router(rate_cards.router)
app.include_router(rate_card_amendments.router)
app.include_router(vendor_portal.router)
app.include_router(kyc_documents.router)
app.include_router(bank_change_requests.router)
app.include_router(notifications.router)
app.include_router(budget_heads.router)
app.include_router(purchase_orders.router)
app.include_router(po_amendments.router)
app.include_router(invoices.router)
app.include_router(doa_matrix.router)
app.include_router(invoice_approvals.router)
app.include_router(approval_delegations.router)
app.include_router(payments.router)
app.include_router(settings.router)
app.include_router(audit_logs.router)
app.include_router(mis.router)
app.include_router(reports.router)

app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")

# React build's hashed asset filenames (vite.config.ts's default dist/assets layout) —
# these are immutable per-build, so ordinary StaticFiles (browser-cacheable) is correct
# here, unlike /static above which serves the old hand-written pages that get edited
# in place under the same filename.
app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="frontend-assets")


@app.get("/health")
def health():
    return {"status": "ok"}


# React app is now the primary UI (Section 8 cutover of the React migration spec) — the
# old hand-written pages remain reachable directly at /static/pages/*.html but are no
# longer the default landing. Every other GET either serves a real file out of the
# built dist/ root (favicon.svg, jhs-logo-mark.webp, etc. — Vite copies `public/` there
# unhashed) or, for anything else (React Router's client-side routes on a full page
# load/refresh — /dashboard, /po-list/<id>, ...), falls back to the SPA shell so
# react-router can take over and resolve the route itself.
@app.get("/{full_path:path}", include_in_schema=False)
def frontend_catch_all(full_path: str):
    candidate = FRONTEND_DIST_DIR / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(FRONTEND_DIST_DIR / "index.html")
