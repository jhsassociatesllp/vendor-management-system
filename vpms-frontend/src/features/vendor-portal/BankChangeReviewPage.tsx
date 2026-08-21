import { useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import {
  type BankChangeRequest,
  useAllBankChangeRequests,
  useApproveBankChangeRequest,
  useRejectBankChangeRequest,
} from '@/features/vendor-portal/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function ActionCell({ request, currentUserId }: { request: BankChangeRequest; currentUserId: string }) {
  const approve = useApproveBankChangeRequest()
  const reject = useRejectBankChangeRequest()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  const isPendingFirst = request.status === 'Pending_First_Approval'
  const isPendingSecond = request.status === 'Pending_Second_Approval'

  if (!isPendingFirst && !isPendingSecond) return <span>—</span>

  if (isPendingSecond && request.first_approved_by === currentUserId) {
    return <p className="text-size-5 text-muted-foreground">You already approved this — a different approver is required.</p>
  }

  async function handleApprove() {
    try {
      const updated = await approve.mutateAsync(request.id)
      toast.success(
        updated.status === 'Approved' ? 'Approved. Vendor bank details have been updated.' : 'Approved. Awaiting a second, different approver.',
      )
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleConfirmReject() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('Rejection reason is required.')
      return
    }
    try {
      await reject.mutateAsync({ id: request.id, reason: trimmed })
      toast.success('Request rejected.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleApprove} disabled={approve.isPending}>
          Approve
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => setShowReject(true)}>
          Reject
        </Button>
      </div>
      {showReject && (
        <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
          <Label htmlFor={`reason-${request.id}`}>Rejection Reason (required)</Label>
          <Textarea id={`reason-${request.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          {reasonError && <p className="mt-1 text-size-5 text-destructive">{reasonError}</p>}
          <Button type="button" variant="destructive" size="sm" className="mt-space-2" onClick={handleConfirmReject}>
            Confirm Reject
          </Button>
        </div>
      )}
    </div>
  )
}

/** Phase 2B UI's bank-change-review.html — Accounts Executive / System Admin only,
 * dual-approval (a different approver required for the second sign-off). */
export function BankChangeReviewPage() {
  const { user } = useAuth()
  const { data: requests, isLoading } = useAllBankChangeRequests()
  const { data: vendors } = useVendors()

  if (!user || !['Accounts Executive', 'System Admin'].includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  const vendorLabelById = new Map((vendors ?? []).map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]))

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Bank Change Approvals</h1>
      <Card>
        <CardContent className="pt-space-3">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !requests || requests.length === 0 ? (
            <EmptyState message="No bank change requests." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>New Account / IFSC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{vendorLabelById.get(r.vendor_id) ?? r.vendor_id}</TableCell>
                    <TableCell>
                      {r.new_account_no} / {r.new_ifsc_code}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      <ActionCell request={r} currentUserId={user.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
