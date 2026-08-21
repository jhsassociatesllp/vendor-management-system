import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { formatDate, money } from '@/lib/utils'
import {
  type InvoiceApproval,
  useAllUsers,
  useDelegations,
  useInvoiceApprovals,
  useInvoiceQueries,
  useRaiseQuery,
  useTakeApprovalAction,
} from '@/features/approvals/hooks'
import { useInvoice } from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { WorkflowTimeline } from '@/components/shared/WorkflowTimeline'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const LEVEL_TO_STATUS: Record<string, string> = {
  L1: 'L1_Verification',
  L2: 'L2_Review',
  L3: 'L3_Approval',
  L4: 'L4_Finance_Approval',
}

interface ActionDef {
  action: string
  variant: 'default' | 'secondary' | 'destructive'
  needsComments: boolean
}

const ACTIONS_BY_LEVEL: Record<string, ActionDef[]> = {
  L1: [
    { action: 'Verify', variant: 'default', needsComments: false },
    { action: 'Return_To_Vendor', variant: 'secondary', needsComments: true },
    { action: 'Reject', variant: 'destructive', needsComments: true },
  ],
  L2: [
    { action: 'Approve', variant: 'default', needsComments: false },
    { action: 'Return_To_Accounts', variant: 'secondary', needsComments: true },
    { action: 'Reject', variant: 'destructive', needsComments: true },
  ],
  L3: [
    { action: 'Approve', variant: 'default', needsComments: false },
    { action: 'Reject', variant: 'destructive', needsComments: true },
  ],
  L4: [
    { action: 'Approve_For_Payment', variant: 'default', needsComments: false },
    { action: 'Hold', variant: 'secondary', needsComments: false },
    { action: 'Reject', variant: 'destructive', needsComments: true },
  ],
}

function findActiveApproval(approvals: InvoiceApproval[], invoiceStatus: string): InvoiceApproval | null {
  if (invoiceStatus === 'On_Hold') {
    return approvals.find((a) => a.level === 'L4') ?? null
  }
  const level = Object.keys(LEVEL_TO_STATUS).find((l) => LEVEL_TO_STATUS[l] === invoiceStatus)
  if (!level) return null
  const approval = approvals.find((a) => a.level === level) ?? null
  return approval && approval.status === 'Pending' ? approval : null
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-space-3 border-b border-border py-2 text-size-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

function ActionButtons({ invoiceId, approval, invoiceStatus }: { invoiceId: string; approval: InvoiceApproval; invoiceStatus: string }) {
  const takeAction = useTakeApprovalAction(invoiceId, approval.id)
  const raiseQuery = useRaiseQuery(invoiceId)

  const [pending, setPending] = useState<ActionDef | null>(null)
  const [comments, setComments] = useState('')
  const [commentsError, setCommentsError] = useState('')

  const [showQueryBox, setShowQueryBox] = useState(false)
  const [queryText, setQueryText] = useState('')
  const [queryError, setQueryError] = useState('')

  const buttons: ActionDef[] =
    invoiceStatus === 'On_Hold' ? [{ action: 'Release', variant: 'default', needsComments: false }] : ACTIONS_BY_LEVEL[approval.level] ?? []

  async function runAction(action: string, commentsText: string | null) {
    try {
      await takeAction.mutateAsync({ action, comments: commentsText })
      toast.success(`"${action.replace(/_/g, ' ')}" recorded.`)
      setPending(null)
      setComments('')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  function handleClick(def: ActionDef) {
    if (def.needsComments) {
      setPending(def)
      setCommentsError('')
    } else {
      runAction(def.action, null)
    }
  }

  function handleConfirmComments() {
    const trimmed = comments.trim()
    if (!trimmed) {
      setCommentsError('Comments are required for this action.')
      return
    }
    if (pending) runAction(pending.action, trimmed)
  }

  async function handleSubmitQuery() {
    const trimmed = queryText.trim()
    if (!trimmed) {
      setQueryError('Query text is required.')
      return
    }
    try {
      await raiseQuery.mutateAsync(trimmed)
      toast.success('Query raised — the invoice is paused until the vendor responds.')
      setShowQueryBox(false)
      setQueryText('')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div>
      <p className="mb-space-2 text-size-4 text-muted-foreground">
        Acting as {approval.assigned_role} on stage {approval.level}.
      </p>
      <div className="flex flex-wrap gap-space-1">
        {buttons.map((b) => (
          <Button
            key={b.action}
            type="button"
            variant={b.variant}
            onClick={() => handleClick(b)}
            disabled={takeAction.isPending}
          >
            {b.action.replace(/_/g, ' ')}
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={() => setShowQueryBox((v) => !v)}>
          Raise Query
        </Button>
      </div>

      {pending && (
        <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
          <label className="mb-1 block text-size-4 font-medium">Comments (required for {pending.action.replace(/_/g, ' ')})</label>
          <Textarea value={comments} onChange={(e) => setComments(e.target.value)} />
          {commentsError && <p className="mt-1 text-size-5 text-destructive">{commentsError}</p>}
          <div className="mt-space-1 flex gap-space-1">
            <Button type="button" onClick={handleConfirmComments} disabled={takeAction.isPending}>
              Confirm
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showQueryBox && (
        <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
          <label className="mb-1 block text-size-4 font-medium">Query Text (required)</label>
          <Textarea value={queryText} onChange={(e) => setQueryText(e.target.value)} />
          {queryError && <p className="mt-1 text-size-5 text-destructive">{queryError}</p>}
          <div className="mt-space-1 flex gap-space-1">
            <Button type="button" onClick={handleSubmitQuery} disabled={raiseQuery.isPending}>
              Submit Query
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowQueryBox(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function InvoiceApprovalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: invoice, isLoading, error } = useInvoice(id)
  const { data: approvals } = useInvoiceApprovals(id)
  const { data: queries } = useInvoiceQueries(id)
  const { data: vendors } = useVendors()
  const { data: users } = useAllUsers()
  const { data: delegations } = useDelegations()

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error || !invoice) {
    return <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">Invoice not found.</div>
  }
  if (!user || !approvals || !queries) return null

  const vendor = vendors?.find((v) => v.id === invoice.vendor_id)
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]))
  const roleById = new Map((users ?? []).map((u) => [u.id, u.role]))

  const openQuery = queries.find((q) => q.status === 'Open')
  const activeApproval = openQuery ? null : findActiveApproval(approvals, invoice.status)

  function canActAsRole(assignedRole: string): boolean {
    if (!user) return false
    if (user.role === assignedRole) return true
    const today = new Date().toISOString().slice(0, 10)
    return (delegations ?? []).some(
      (d) => d.delegate_user_id === user.id && d.valid_from <= today && d.valid_to >= today && roleById.get(d.delegator_user_id) === assignedRole,
    )
  }

  return (
    <div className="flex flex-col gap-space-2">
      <Card>
        <CardContent className="pt-space-3">
          <h1 className="mb-space-2 font-heading text-size-1 font-bold">Invoice Approval</h1>
          <WorkflowTimeline stages={approvals} invoiceStatus={invoice.status} />
          <FieldRow label="Invoice Number" value={invoice.invoice_number} />
          <FieldRow label="Status" value={<StatusBadge status={invoice.status} />} />
          <FieldRow label="Vendor" value={vendor ? `${vendor.vendor_name} (${vendor.vendor_code})` : invoice.vendor_id} />
          <FieldRow label="Total Invoice Amount" value={money(invoice.total_invoice_amount)} />
          <FieldRow label="Invoice Date" value={invoice.invoice_date} />
          <FieldRow label="Work Description" value={invoice.work_description} />
        </CardContent>
      </Card>

      {queries.length > 0 && (
        <Card>
          <CardContent className="pt-space-3">
            <h2 className="mb-space-2 font-heading text-size-2 font-bold">Queries</h2>
            <div className="flex flex-col gap-space-2">
              {queries.map((q) => (
                <div key={q.id} className="rounded-md border border-border bg-background p-space-2">
                  <FieldRow label="Raised At Level" value={q.raised_at_level} />
                  <FieldRow label="Raised By" value={userNameById.get(q.raised_by) ?? q.raised_by} />
                  <FieldRow label="Status" value={<StatusBadge status={q.status} />} />
                  <FieldRow label="Query" value={q.query_text} />
                  <FieldRow label="Raised" value={formatDate(q.created_at)} />
                  {q.status === 'Responded' && (
                    <>
                      <FieldRow label="Vendor Response" value={q.vendor_response} />
                      <FieldRow label="Responded" value={formatDate(q.responded_at)} />
                    </>
                  )}
                </div>
              ))}
              {openQuery && <p className="text-size-4 text-muted-foreground">Nothing to approve until the vendor responds.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {activeApproval && (
        <Card>
          <CardContent className="pt-space-3">
            <h2 className="mb-space-2 font-heading text-size-2 font-bold">Action</h2>
            {canActAsRole(activeApproval.assigned_role) ? (
              <ActionButtons invoiceId={invoice.id} approval={activeApproval} invoiceStatus={invoice.status} />
            ) : (
              <p className="text-size-4 text-muted-foreground">
                Currently pending {activeApproval.assigned_role} — you don't have an active role or delegation for this stage.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
