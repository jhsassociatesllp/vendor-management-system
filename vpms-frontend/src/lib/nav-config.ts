/** Route paths, one per old `.html` page (Section 5.2: "every .html file becomes one
 * route"). Kept as a named map so nav links and <Route> definitions can't drift apart —
 * every module adds its own routes here as it's built, module by module per Section 10. */
export const ROUTES = {
  login: '/login',
  vendorLogin: '/vendor-login',
  dashboard: '/dashboard',
  vendorDashboard: '/vendor-dashboard',

  // Vendor (Phase 1 UI)
  vendorRequestForm: '/vendor-request-form',
  vendorRequestsList: '/vendor-requests-list',
  requestDetail: (id = ':id') => `/request-detail/${id}`,
  itemCodes: '/item-codes',

  // Vendor Portal (Phase 2B UI)
  vendorKycUpload: '/vendor-kyc-upload',
  vendorBankChange: '/vendor-bank-change',
  vendorNotifications: '/vendor-notifications',
  kycReviewQueue: '/kyc-review-queue',
  bankChangeReview: '/bank-change-review',

  // Procurement (Phase 3 UI)
  budgetHeads: '/budget-heads',
  poCreate: '/po-create',
  poList: '/po-list',
  poDetail: (id = ':id') => `/po-detail/${id}`,
  invoicesList: '/invoices-list',
  invoiceDetail: (id = ':id') => `/invoice-detail/${id}`,
  vendorPoList: '/vendor-po-list',
  vendorInvoiceSubmit: '/vendor-invoice-submit',
  vendorInvoicesList: '/vendor-invoices-list',

  // Approvals/Payment (Phase 4 UI)
  myApprovalQueue: '/my-approval-queue',
  invoiceApprovalDetail: (id = ':id') => `/invoice-approval-detail/${id}`,
  delegationSetup: '/delegation-setup',
  doaMatrix: '/doa-matrix',
  escalations: '/escalations',
  paymentQueue: '/payment-queue',
  paymentRecordForm: (invoiceId = ':invoiceId') => `/payment-record-form/${invoiceId}`,
  paymentConfirmQueue: '/payment-confirm-queue',
  msmeAlerts: '/msme-alerts',
  vendorInvoiceTrack: '/vendor-invoice-track',

  // MIS (Phase 5 UI)
  misDashboard: '/mis-dashboard',
  reports: '/reports',
  reportViewer: '/report-viewer',
  auditTrail: '/audit-trail',
} as const

export interface NavItem {
  label: string
  href: string
}

/** Direct port of the old static site's NAV_BY_ROLE (static/js/api.js) — same roles,
 * same link sets, same order. Only the href scheme changed (route paths, not .html files). */
export const NAV_BY_ROLE: Record<string, NavItem[]> = {
  'Dept. Manager': [
    { label: 'Dashboard', href: ROUTES.dashboard },
    { label: 'New Vendor Request', href: ROUTES.vendorRequestForm },
    { label: 'My Requests', href: ROUTES.vendorRequestsList },
    { label: 'Purchase Orders', href: ROUTES.poList },
    { label: 'Invoices', href: ROUTES.invoicesList },
    { label: 'My Approvals', href: ROUTES.myApprovalQueue },
    { label: 'Delegations', href: ROUTES.delegationSetup },
    { label: 'Escalations', href: ROUTES.escalations },
  ],
  'Accounts Executive': [
    { label: 'Dashboard', href: ROUTES.dashboard },
    { label: 'Requests Pending Review', href: ROUTES.vendorRequestsList },
    { label: 'Item Codes', href: ROUTES.itemCodes },
    { label: 'KYC Review Queue', href: ROUTES.kycReviewQueue },
    { label: 'Bank Change Approvals', href: ROUTES.bankChangeReview },
    { label: 'Purchase Orders', href: ROUTES.poList },
    { label: 'Invoices', href: ROUTES.invoicesList },
    { label: 'My Approvals', href: ROUTES.myApprovalQueue },
    { label: 'Delegations', href: ROUTES.delegationSetup },
    { label: 'Escalations', href: ROUTES.escalations },
    { label: 'Reports', href: ROUTES.reports },
    { label: 'Notifications', href: ROUTES.vendorNotifications },
  ],
  'Partner / VP': [
    { label: 'Dashboard', href: ROUTES.dashboard },
    { label: 'Requests Pending Approval', href: ROUTES.vendorRequestsList },
    { label: 'PO Approvals', href: `${ROUTES.poList}?status=Pending_Approval` },
    { label: 'My Approvals', href: ROUTES.myApprovalQueue },
    { label: 'Delegations', href: ROUTES.delegationSetup },
    { label: 'Escalations', href: ROUTES.escalations },
    { label: 'MIS Dashboard', href: ROUTES.misDashboard },
    { label: 'Reports', href: ROUTES.reports },
    { label: 'Notifications', href: ROUTES.vendorNotifications },
  ],
  'Budget Controller': [
    { label: 'Dashboard', href: ROUTES.dashboard },
    { label: 'Budget Heads', href: ROUTES.budgetHeads },
    { label: 'PO Approvals', href: `${ROUTES.poList}?status=Pending_Approval` },
    { label: 'Reports', href: ROUTES.reports },
    { label: 'Notifications', href: ROUTES.vendorNotifications },
  ],
  'Finance Team': [
    { label: 'Dashboard', href: ROUTES.dashboard },
    { label: 'Payment Queue', href: ROUTES.paymentQueue },
    { label: 'Confirm Payments', href: ROUTES.paymentConfirmQueue },
    { label: 'MSME Alerts', href: ROUTES.msmeAlerts },
    { label: 'My Approvals', href: ROUTES.myApprovalQueue },
    { label: 'Delegations', href: ROUTES.delegationSetup },
    { label: 'Escalations', href: ROUTES.escalations },
    { label: 'Invoices', href: ROUTES.invoicesList },
    { label: 'MIS Dashboard', href: ROUTES.misDashboard },
    { label: 'Reports', href: ROUTES.reports },
    { label: 'Notifications', href: ROUTES.vendorNotifications },
  ],
  'Compliance / Audit': [
    { label: 'Dashboard', href: ROUTES.dashboard },
    { label: 'Audit Trail', href: ROUTES.auditTrail },
    { label: 'Reports', href: ROUTES.reports },
  ],
  'System Admin': [
    { label: 'Dashboard', href: ROUTES.dashboard },
    { label: 'New Vendor Request', href: ROUTES.vendorRequestForm },
    { label: 'Vendor Requests', href: ROUTES.vendorRequestsList },
    { label: 'Item Codes', href: ROUTES.itemCodes },
    { label: 'KYC Review Queue', href: ROUTES.kycReviewQueue },
    { label: 'Bank Change Approvals', href: ROUTES.bankChangeReview },
    { label: 'Budget Heads', href: ROUTES.budgetHeads },
    { label: 'Purchase Orders', href: ROUTES.poList },
    { label: 'PO Approvals', href: `${ROUTES.poList}?status=Pending_Approval` },
    { label: 'Invoices', href: ROUTES.invoicesList },
    { label: 'My Approvals', href: ROUTES.myApprovalQueue },
    { label: 'Delegations', href: ROUTES.delegationSetup },
    { label: 'DoA Matrix', href: ROUTES.doaMatrix },
    { label: 'Escalations', href: ROUTES.escalations },
    { label: 'Payment Queue', href: ROUTES.paymentQueue },
    { label: 'Confirm Payments', href: ROUTES.paymentConfirmQueue },
    { label: 'MSME Alerts', href: ROUTES.msmeAlerts },
    { label: 'MIS Dashboard', href: ROUTES.misDashboard },
    { label: 'Reports', href: ROUTES.reports },
    { label: 'Audit Trail', href: ROUTES.auditTrail },
    { label: 'Notifications', href: ROUTES.vendorNotifications },
  ],
  Vendor: [
    { label: 'Dashboard', href: ROUTES.vendorDashboard },
    { label: 'Upload KYC Documents', href: ROUTES.vendorKycUpload },
    { label: 'Bank Change Request', href: ROUTES.vendorBankChange },
    { label: 'My Purchase Orders', href: ROUTES.vendorPoList },
    { label: 'Submit Invoice', href: ROUTES.vendorInvoiceSubmit },
    { label: 'My Invoices', href: ROUTES.vendorInvoicesList },
    { label: 'Notifications', href: ROUTES.vendorNotifications },
  ],
}

export function navLinksForRole(role: string): NavItem[] {
  return NAV_BY_ROLE[role] ?? []
}
