import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { ROUTES } from '@/lib/nav-config'
import { money } from '@/lib/utils'
import { useRecordPayment, useTdsDefault } from '@/features/approvals/hooks'
import { useInvoice } from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UrgencyChip } from '@/components/shared/UrgencyChip'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const FINANCE_ROLES = ['Finance Team', 'System Admin']
const PAYMENT_MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque']

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-space-3 border-b border-border py-2 text-size-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

export function PaymentRecordFormPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: invoice, isLoading, error } = useInvoice(invoiceId)
  const { data: vendors } = useVendors()
  const { data: defaultTds } = useTdsDefault(invoice?.status === 'Approved_For_Payment' ? invoiceId : undefined)
  const recordPayment = useRecordPayment()

  const [tdsSection, setTdsSection] = useState('')
  const [tdsRate, setTdsRate] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [paymentMode, setPaymentMode] = useState('NEFT')
  const [companyBankAccount, setCompanyBankAccount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [utrReference, setUtrReference] = useState('')
  const [itcEligible, setItcEligible] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (defaultTds) {
      setTdsSection(defaultTds.tds_section)
      setTdsRate(String(defaultTds.tds_rate))
    }
  }, [defaultTds])

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error || !invoice) {
    return <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">Invoice not found.</div>
  }
  if (!user) return null

  if (!FINANCE_ROLES.includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  const vendor = vendors?.find((v) => v.id === invoice.vendor_id)

  if (invoice.status !== 'Approved_For_Payment') {
    return (
      <Card>
        <CardContent className="pt-space-3">
          <h1 className="mb-space-2 font-heading text-size-1 font-bold">Record Payment</h1>
          <FieldRow label="Invoice Number" value={invoice.invoice_number} />
          <FieldRow label="Status" value={<StatusBadge status={invoice.status} />} />
          <p className="mt-space-2 rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
            This invoice must be Approved_For_Payment to record a payment (current status: {invoice.status}).
          </p>
        </CardContent>
      </Card>
    )
  }

  const gross = Number(invoice.total_invoice_amount)
  const rate = Number(tdsRate)
  const hasRate = tdsRate !== '' && !Number.isNaN(rate)
  const tds = hasRate ? (gross * rate) / 100 : 0
  const net = hasRate ? gross - tds : 0
  const overridden = defaultTds ? tdsSection.trim() !== defaultTds.tds_section || rate !== Number(defaultTds.tds_rate) : false

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')

    if (overridden && !overrideReason.trim()) {
      setFormError('A reason is required when overriding the default TDS section/rate.')
      return
    }
    if (!companyBankAccount.trim() || !paymentDate || !utrReference.trim()) {
      setFormError('All fields are required.')
      return
    }

    try {
      const payment = await recordPayment.mutateAsync({
        invoice_id: invoiceId!,
        tds_section: tdsSection.trim(),
        tds_rate: tdsRate,
        tds_override_reason: overridden ? overrideReason.trim() : null,
        payment_mode: paymentMode,
        company_bank_account: companyBankAccount.trim(),
        payment_date: paymentDate,
        utr_reference: utrReference.trim(),
        itc_eligible: itcEligible,
      })
      toast.success(`Payment recorded (net payable ${money(payment.net_payable_amount)}). Awaiting a different Finance user's confirmation.`)
      navigate(ROUTES.paymentQueue)
    } catch (err) {
      setFormError(friendlyMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <Card>
        <CardContent className="pt-space-3">
          <h1 className="mb-space-2 font-heading text-size-1 font-bold">Record Payment</h1>
          <FieldRow label="Invoice Number" value={invoice.invoice_number} />
          <FieldRow
            label="Vendor"
            value={
              vendor ? (
                <span className="inline-flex items-center gap-2">
                  {vendor.vendor_name} ({vendor.vendor_code})
                  {vendor.msme_status && <Badge variant="neutral">MSME</Badge>}
                </span>
              ) : (
                invoice.vendor_id
              )
            }
          />
          <FieldRow label="Total Invoice Amount" value={money(invoice.total_invoice_amount)} />
          <FieldRow
            label="Payment Due Date"
            value={
              <span className="inline-flex items-center gap-2">
                {invoice.payment_due_date ?? '—'}
                <UrgencyChip dueDateIso={invoice.payment_due_date} thresholdDays={7} />
              </span>
            }
          />
          <FieldRow label="Status" value={<StatusBadge status={invoice.status} />} />
        </CardContent>
      </Card>

      {defaultTds && (
        <Card>
          <CardContent className="pt-space-3">
            <form onSubmit={handleSubmit} noValidate>
              <Label htmlFor="tds_section">TDS Section</Label>
              <Input id="tds_section" value={tdsSection} onChange={(e) => setTdsSection(e.target.value)} />

              <Label htmlFor="tds_rate">TDS Rate (%)</Label>
              <Input id="tds_rate" type="number" step="0.01" min={0} value={tdsRate} onChange={(e) => setTdsRate(e.target.value)} />

              {overridden && (
                <div className="mt-space-2">
                  <Label htmlFor="tds_override_reason">Override Reason (required)</Label>
                  <Input id="tds_override_reason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                </div>
              )}

              <div className="mt-space-2 grid grid-cols-3 gap-space-2 rounded-md border border-border bg-background p-space-2 text-size-4">
                <div>
                  <div className="text-muted-foreground">Gross</div>
                  <div className="font-medium">{hasRate ? money(gross) : '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">TDS</div>
                  <div className="font-medium">{hasRate ? money(tds) : '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Net Payable</div>
                  <div className="font-medium">{hasRate ? money(net) : '—'}</div>
                </div>
              </div>

              <Label htmlFor="payment_mode" className="mt-space-2">
                Payment Mode
              </Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger id="payment_mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label htmlFor="company_bank_account">Company Bank Account</Label>
              <Input id="company_bank_account" value={companyBankAccount} onChange={(e) => setCompanyBankAccount(e.target.value)} />

              <Label htmlFor="payment_date">Payment Date</Label>
              <Input id="payment_date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />

              <Label htmlFor="utr_reference">UTR Reference</Label>
              <Input id="utr_reference" value={utrReference} onChange={(e) => setUtrReference(e.target.value)} />

              <div className="mt-space-2 flex items-center gap-space-1">
                <Checkbox id="itc_eligible" checked={itcEligible} onCheckedChange={(v) => setItcEligible(!!v)} />
                <Label htmlFor="itc_eligible" className="mb-0 mt-0 font-normal">
                  ITC Eligible
                </Label>
              </div>

              {formError && <p className="mt-space-2 text-size-5 text-destructive">{formError}</p>}
              <Button type="submit" className="mt-space-3" disabled={recordPayment.isPending}>
                Record Payment
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
