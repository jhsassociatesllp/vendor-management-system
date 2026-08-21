import { Badge } from '@/components/ui/badge'

/** Direct port of the old static site's STATUS_BADGE_VARIANT map (static/js/api.js) —
 * one status-badge system reused across every phase's statuses, unchanged. */
const STATUS_BADGE_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  // Phase 1: vendor requests
  Submitted: 'neutral',
  Accounts_Review: 'warning',
  Pending_Partner_Approval: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Archived: 'neutral',
  // Phase 2A: agreements
  Active: 'success',
  Expired: 'neutral',
  Terminated: 'danger',
  // Phase 2A: billing milestones / rate amendments
  Pending: 'warning',
  Achieved: 'success',
  Invoiced: 'success',
  // Phase 2B: KYC documents / bank change requests
  Pending_Review: 'warning',
  Pending_First_Approval: 'warning',
  Pending_Second_Approval: 'warning',
  Verified: 'success',
  // Phase 3A: purchase orders / amendments / GRN-SCN
  Pending_Approval: 'warning',
  Vendor_Acknowledged: 'success',
  Cancelled: 'danger',
  Lapsed: 'neutral',
  Closed: 'neutral',
  // Phase 3B: invoices
  Draft: 'neutral',
  // Phase 4A: approval workflow
  L1_Verification: 'warning',
  L2_Review: 'warning',
  L3_Approval: 'warning',
  L4_Finance_Approval: 'warning',
  Approved_For_Payment: 'success',
  Query_Raised: 'warning',
  Returned_To_Vendor: 'warning',
  On_Hold: 'warning',
  Completed: 'success',
  Returned: 'warning',
  Skipped: 'neutral',
  Open: 'warning',
  Responded: 'success',
  // Phase 4B: payment recording
  Paid: 'success',
  Maker_Recorded: 'warning',
  Checker_Confirmed: 'success',
  // Phase 5: audit trail actions
  Create: 'success',
  Update: 'warning',
  Approve: 'success',
  Reject: 'danger',
  Delete: 'danger',
  View: 'neutral',
  Login: 'success',
  Logout: 'neutral',
  Login_Failed: 'danger',
  Document_Upload: 'neutral',
  System: 'neutral',
}

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_BADGE_VARIANT[status] ?? 'neutral'
  const label = status.replace(/_/g, ' ')
  return <Badge variant={variant}>{label}</Badge>
}
