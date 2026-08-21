import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { formatDate, money } from '@/lib/utils'
import { useInvoiceApprovals, useInvoiceQueries, useInvoicePayment, useRespondToQuery, useResubmitInvoice } from '@/features/approvals/hooks'
import { useInvoice } from '@/features/procurement/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { WorkflowTimeline } from '@/components/shared/WorkflowTimeline'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-space-3 border-b border-border py-2 text-size-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

function ResubmitBox({ invoiceId }: { invoiceId: string }) {
  const resubmit = useResubmitInvoice(invoiceId)

  async function handleResubmit() {
    try {
      await resubmit.mutateAsync()
      toast.success('Invoice resubmitted.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
      <p className="mb-space-2 text-size-4">This invoice was returned. Once you've made corrections, resubmit it to send it back into review.</p>
      <Button type="button" onClick={handleResubmit} disabled={resubmit.isPending}>
        Resubmit
      </Button>
    </div>
  )
}

function OpenQueryResponse({ invoiceId, queryId }: { invoiceId: string; queryId: string }) {
  const respond = useRespondToQuery(invoiceId)
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit() {
    const trimmed = response.trim()
    if (!trimmed) {
      setError('A response is required.')
      return
    }
    try {
      await respond.mutateAsync({ queryId, response: trimmed })
      toast.success('Response submitted — this invoice is back with the reviewer.')
      setResponse('')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div className="mt-space-2">
      <label className="mb-1 block text-size-4 font-medium">Your Response</label>
      <Textarea value={response} onChange={(e) => setResponse(e.target.value)} />
      {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      <Button type="button" className="mt-space-1" onClick={handleSubmit} disabled={respond.isPending}>
        Submit Response
      </Button>
    </div>
  )
}

function PaymentInfo({ invoiceId }: { invoiceId: string }) {
  const { data: payment, error } = useInvoicePayment(invoiceId)
  if (error) return <p className="text-size-4 text-destructive">{friendlyMessage(error)}</p>
  if (!payment) return <p className="text-muted-foreground">Loading…</p>
  return (
    <>
      <FieldRow label="Payment Date" value={payment.payment_date} />
      <FieldRow label="UTR Reference" value={payment.utr_reference} />
      <FieldRow label="Payment Mode" value={payment.payment_mode} />
    </>
  )
}

export function VendorInvoiceTrackPage() {
  const [searchParams] = useSearchParams()
  const invoiceId = searchParams.get('id') ?? undefined
  const { user } = useAuth()
  const { data: invoice, isLoading, error } = useInvoice(invoiceId)
  const { data: approvals } = useInvoiceApprovals(invoiceId)
  const { data: queries } = useInvoiceQueries(invoiceId)

  if (!invoiceId) {
    return <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">No invoice id given.</div>
  }
  if (!user) return null
  if (user.role !== 'Vendor') {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        This page is only available to vendor-portal accounts.
      </div>
    )
  }
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error || !invoice || !approvals || !queries) {
    return <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">Invoice not found.</div>
  }

  const openQuery = queries.find((q) => q.status === 'Open')

  return (
    <div className="flex flex-col gap-space-2">
      <Card>
        <CardContent className="pt-space-3">
          <h1 className="mb-space-2 font-heading text-size-1 font-bold">Invoice Tracking</h1>
          <WorkflowTimeline stages={approvals} invoiceStatus={invoice.status} />
          <FieldRow label="Invoice Number" value={invoice.invoice_number} />
          <FieldRow label="Status" value={<StatusBadge status={invoice.status} />} />
          <FieldRow label="Total Invoice Amount" value={money(invoice.total_invoice_amount)} />
          <FieldRow label="Invoice Date" value={invoice.invoice_date} />
          {invoice.status === 'Returned_To_Vendor' && <ResubmitBox invoiceId={invoice.id} />}
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
                  <FieldRow label="Status" value={<StatusBadge status={q.status} />} />
                  <FieldRow label="Query" value={q.query_text} />
                  <FieldRow label="Raised" value={formatDate(q.created_at)} />
                  {q.status === 'Responded' && (
                    <>
                      <FieldRow label="Your Response" value={q.vendor_response} />
                      <FieldRow label="Responded" value={formatDate(q.responded_at)} />
                    </>
                  )}
                </div>
              ))}
              {openQuery && <OpenQueryResponse invoiceId={invoice.id} queryId={openQuery.id} />}
            </div>
          </CardContent>
        </Card>
      )}

      {invoice.status === 'Paid' && (
        <Card>
          <CardContent className="pt-space-3">
            <h2 className="mb-space-2 font-heading text-size-2 font-bold">Payment</h2>
            <PaymentInfo invoiceId={invoice.id} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
