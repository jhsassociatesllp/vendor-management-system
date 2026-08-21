import { useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { money } from '@/lib/utils'
import { type Payment, useAllUsers, useConfirmPayment, usePendingConfirmation, useRejectPayment } from '@/features/approvals/hooks'
import { useInvoices } from '@/features/procurement/hooks'
import { EmptyState } from '@/components/shared/EmptyState'
import { DisabledActionTooltip } from '@/components/shared/DisabledActionTooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const FINANCE_ROLES = ['Finance Team', 'System Admin']

function PaymentRow({ payment, invoiceNumber, makerName }: { payment: Payment; invoiceNumber: string; makerName: string }) {
  const { user } = useAuth()
  const confirmPayment = useConfirmPayment()
  const rejectPayment = useRejectPayment()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  const isOwnPayment = payment.initiated_by === user?.id

  async function handleConfirm() {
    try {
      await confirmPayment.mutateAsync(payment.id)
      toast.success('Payment confirmed — invoice marked Paid.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleReject() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('A reason is required.')
      return
    }
    try {
      await rejectPayment.mutateAsync({ paymentId: payment.id, reason: trimmed })
      toast.success('Payment rejected. The maker must record a fresh payment.')
      setShowReject(false)
      setReason('')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <TableRow>
      <TableCell>{invoiceNumber}</TableCell>
      <TableCell>{money(payment.net_payable_amount)}</TableCell>
      <TableCell>{payment.payment_mode}</TableCell>
      <TableCell>{payment.utr_reference}</TableCell>
      <TableCell>{makerName}</TableCell>
      <TableCell>
        {isOwnPayment ? (
          <DisabledActionTooltip reason="You recorded this payment — a different Finance user must confirm or reject it.">
            <Button type="button" disabled>
              Confirm
            </Button>
          </DisabledActionTooltip>
        ) : (
          <div className="flex flex-col items-start gap-space-1">
            <div className="flex gap-space-1">
              <Button type="button" onClick={handleConfirm} disabled={confirmPayment.isPending}>
                Confirm
              </Button>
              <Button type="button" variant="destructive" onClick={() => setShowReject((v) => !v)}>
                Reject
              </Button>
            </div>
            {showReject && (
              <div className="w-full rounded-md border border-border bg-background p-space-2">
                <label className="mb-1 block text-size-4 font-medium">Rejection Reason (required)</label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                {reasonError && <p className="mt-1 text-size-5 text-destructive">{reasonError}</p>}
                <Button type="button" variant="destructive" className="mt-space-1" onClick={handleReject} disabled={rejectPayment.isPending}>
                  Confirm Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}

export function PaymentConfirmQueuePage() {
  const { user } = useAuth()
  const { data: payments, isLoading } = usePendingConfirmation()
  const { data: invoices } = useInvoices()
  const { data: users } = useAllUsers()

  if (!user || !FINANCE_ROLES.includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  const invoiceById = new Map((invoices ?? []).map((inv) => [inv.id, inv]))
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]))

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Confirm Payments</h1>
      <Card>
        <CardContent className="pt-space-3">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !payments || payments.length === 0 ? (
            <EmptyState message="Nothing awaiting confirmation." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Net Payable</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>UTR</TableHead>
                    <TableHead>Recorded By</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <PaymentRow
                      key={p.id}
                      payment={p}
                      invoiceNumber={invoiceById.get(p.invoice_id)?.invoice_number ?? p.invoice_id}
                      makerName={userNameById.get(p.initiated_by) ?? p.initiated_by}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
