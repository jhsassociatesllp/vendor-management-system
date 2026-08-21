import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import {
  useAgreement,
  useApproveAmendment,
  useApprovePurchaseOrder,
  useBudgetAvailability,
  useBudgetHeads,
  useCancelPurchaseOrder,
  usePoAmendments,
  usePoGrnEntries,
  useProposeAmendment,
  usePurchaseOrder,
  useRecordGrn,
  useRejectAmendment,
  useRejectPurchaseOrder,
} from '@/features/procurement/hooks'
import { useItemCodes, useVendors } from '@/features/vendor/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { BudgetBar } from '@/components/shared/BudgetBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const BUDGET_APPROVER_ROLES = ['Budget Controller', 'Partner / VP', 'System Admin']
const CANCEL_ROLES = ['Accounts Executive', 'System Admin']
const AMEND_ROLES = ['Dept. Manager', 'Accounts Executive', 'System Admin']
const GRN_ROLES = ['Dept. Manager', 'Accounts Executive', 'System Admin']

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-space-3 border-b border-border py-2 text-size-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

function ReasonBox({ label, onConfirm }: { label: string; onConfirm: (reason: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (!visible) {
    return (
      <Button type="button" variant="destructive" onClick={() => setVisible(true)}>
        Reject
      </Button>
    )
  }

  return (
    <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
      <Label>{label}</Label>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      <div className="mt-space-2 flex gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            const trimmed = reason.trim()
            if (!trimmed) {
              setError('A reason is required.')
              return
            }
            onConfirm(trimmed)
          }}
        >
          Confirm Reject
        </Button>
        <Button type="button" variant="outline" onClick={() => setVisible(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AmendmentForm({ poId, quantity, rate, deliveryDate }: { poId: string; quantity: string; rate: string; deliveryDate: string }) {
  const [visible, setVisible] = useState(false)
  const [newQuantity, setNewQuantity] = useState(quantity)
  const [newRate, setNewRate] = useState(rate)
  const [newDate, setNewDate] = useState(deliveryDate)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const proposeAmendment = useProposeAmendment(poId)

  if (!visible) {
    return (
      <Button type="button" variant="outline" onClick={() => setVisible(true)}>
        Propose Amendment
      </Button>
    )
  }

  async function handleSubmit() {
    setError('')
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setError('A reason is required.')
      return
    }
    try {
      await proposeAmendment.mutateAsync({ new_quantity: newQuantity, new_rate: newRate, new_delivery_date: newDate, reason: trimmedReason })
      toast.success('Amendment proposed — it requires approval before taking effect.')
      setVisible(false)
      setReason('')
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  return (
    <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
      <Label>New Quantity</Label>
      <Input type="number" min={0.01} step="0.01" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} />
      <Label>New Rate</Label>
      <Input type="number" min={0.01} step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
      <Label>New Delivery / Completion Date</Label>
      <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
      <Label>Reason (required)</Label>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      <div className="mt-space-2 flex gap-2">
        <Button type="button" onClick={handleSubmit} disabled={proposeAmendment.isPending}>
          Submit Amendment
        </Button>
        <Button type="button" variant="outline" onClick={() => setVisible(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function GrnForm({ poId, quantity, unit, cumulative }: { poId: string; quantity: string; unit: string; cumulative: number }) {
  const [visible, setVisible] = useState(false)
  const [type, setType] = useState<'GRN' | 'SCN'>('GRN')
  const [qty, setQty] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const recordGrn = useRecordGrn(poId)

  // Same math the backend enforces (grn_scn_repository.confirmed_total_for_po): GRN and
  // SCN entries both add to the same cumulative pool against po.quantity — SCN is not a
  // subtraction. Getting this backwards would silently show a wrong "remaining" figure.
  const remaining = (Number(quantity) - cumulative).toFixed(2)

  if (!visible) {
    return (
      <Button type="button" variant="outline" onClick={() => setVisible(true)}>
        Record GRN / SCN
      </Button>
    )
  }

  async function handleSubmit() {
    setError('')
    const trimmedDescription = description.trim()
    if (!trimmedDescription) {
      setError('A description is required.')
      return
    }
    try {
      await recordGrn.mutateAsync({ type, quantity_confirmed: qty, description: trimmedDescription })
      toast.success('GRN/SCN entry recorded.')
      setVisible(false)
      setQty('')
      setDescription('')
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  return (
    <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
      <p className="text-size-4 text-muted-foreground">
        Confirmed so far: {cumulative} of {quantity} {unit} ({remaining} remaining).
      </p>
      <Label>Type</Label>
      <Select value={type} onValueChange={(v) => setType(v as 'GRN' | 'SCN')}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="GRN">GRN (goods)</SelectItem>
          <SelectItem value="SCN">SCN (service)</SelectItem>
        </SelectContent>
      </Select>
      <Label>Quantity Confirmed</Label>
      <Input type="number" min={0.01} step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
      <Label>Description (required)</Label>
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      <div className="mt-space-2 flex gap-2">
        <Button type="button" onClick={handleSubmit} disabled={recordGrn.isPending}>
          Submit
        </Button>
        <Button type="button" variant="outline" onClick={() => setVisible(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function PoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: po, isLoading, error } = usePurchaseOrder(id)
  const { data: vendors } = useVendors()
  const { data: itemCodes } = useItemCodes()
  const { data: agreement } = useAgreement(po?.agreement_id)
  const { data: budgetHeads } = useBudgetHeads()
  const { data: availability } = useBudgetAvailability(po?.budget_head_id)
  const { data: grnEntries } = usePoGrnEntries(id)
  const { data: amendments } = usePoAmendments(id)

  const approvePo = useApprovePurchaseOrder(id ?? '')
  const rejectPo = useRejectPurchaseOrder(id ?? '')
  const cancelPo = useCancelPurchaseOrder(id ?? '')
  const approveAmendment = useApproveAmendment(id ?? '')
  const rejectAmendment = useRejectAmendment(id ?? '')

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error || !po) {
    return <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">Purchase order not found.</div>
  }
  if (!user) return null

  const vendor = vendors?.find((v) => v.id === po.vendor_id)
  const item = itemCodes?.find((i) => i.id === po.item_code_id)
  const budgetHead = budgetHeads?.find((b) => b.id === po.budget_head_id)

  const cumulativeConfirmed = (grnEntries ?? []).reduce((sum, e) => sum + Number(e.quantity_confirmed), 0)

  const showApproveReject = BUDGET_APPROVER_ROLES.includes(user.role) && po.status === 'Pending_Approval'
  const showCancel = CANCEL_ROLES.includes(user.role) && ['Pending_Approval', 'Approved'].includes(po.status)
  const showAmend = AMEND_ROLES.includes(user.role) && ['Approved', 'Vendor_Acknowledged'].includes(po.status)
  const showGrn = GRN_ROLES.includes(user.role) && po.status === 'Vendor_Acknowledged'

  async function handleApprove() {
    try {
      await approvePo.mutateAsync()
      toast.success('PO approved.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleReject(reason: string) {
    try {
      await rejectPo.mutateAsync(reason)
      toast.success('PO rejected.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleCancel() {
    try {
      await cancelPo.mutateAsync()
      toast.success('PO cancelled — budget released.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleApproveAmendment(amendmentId: string) {
    try {
      await approveAmendment.mutateAsync(amendmentId)
      toast.success('Amendment approved — the PO now requires fresh approval.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleRejectAmendment(amendmentId: string) {
    try {
      await rejectAmendment.mutateAsync(amendmentId)
      toast.success('Amendment rejected — the PO is unchanged.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <Card>
        <CardContent className="pt-space-3">
          <h1 className="mb-space-2 font-heading text-size-1 font-bold">Purchase Order</h1>
          <FieldRow label="PO Number" value={po.po_number} />
          <FieldRow label="Version" value={po.version} />
          <FieldRow label="Status" value={<StatusBadge status={po.status} />} />
          <FieldRow label="Vendor" value={vendor ? `${vendor.vendor_name} (${vendor.vendor_code})` : po.vendor_id} />
          <FieldRow label="Item Code" value={item ? `${item.category} / ${item.sub_category} — ${item.description}` : po.item_code_id} />
          <FieldRow label="Agreement" value={agreement?.agreement_number ?? po.agreement_id} />
          <FieldRow label="Description" value={po.description} />
          <FieldRow label="Quantity" value={`${po.quantity} ${po.unit}`} />
          <FieldRow label="Rate" value={po.rate} />
          <FieldRow label="Taxable Amount" value={po.po_value_excl_gst} />
          <FieldRow label="GST Amount" value={po.gst_amount} />
          <FieldRow label="Total (incl. GST)" value={po.total_po_value_incl_gst} />
          <FieldRow label="Delivery / Completion Date" value={po.delivery_completion_date} />
          <FieldRow label="PO Validity Date" value={po.po_validity_date} />
          <FieldRow label="PO Date" value={po.po_date} />
          {po.rate_override_reason && <FieldRow label="Rate Override Reason" value={po.rate_override_reason} />}
          {po.over_budget_justification && <FieldRow label="Over-Budget Justification" value={po.over_budget_justification} />}
          {po.vendor_acknowledged_at && <FieldRow label="Vendor Acknowledged At" value={formatDate(po.vendor_acknowledged_at)} />}
          {po.rejection_reason && <FieldRow label="Rejection Reason" value={po.rejection_reason} />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-1 font-heading text-size-2 font-bold">Budget</h2>
          <p className="mb-space-2 text-size-5 text-muted-foreground">
            {budgetHead ? `${budgetHead.department} — ${budgetHead.cost_centre} (${budgetHead.period_label})` : ''}
          </p>
          {availability ? (
            <BudgetBar sanctioned={Number(availability.sanctioned_amount)} committed={Number(availability.committed_amount)} />
          ) : (
            <p className="text-size-4 text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      {(showApproveReject || showCancel || showAmend || showGrn) && (
        <Card>
          <CardContent className="flex flex-col gap-space-2 pt-space-3">
            {showApproveReject && (
              <div className="flex flex-wrap items-start gap-2">
                <Button type="button" onClick={handleApprove} disabled={approvePo.isPending}>
                  Approve
                </Button>
                <ReasonBox label="Rejection Reason (required)" onConfirm={handleReject} />
              </div>
            )}
            {showCancel && (
              <Button type="button" variant="destructive" onClick={handleCancel} disabled={cancelPo.isPending}>
                Cancel PO
              </Button>
            )}
            {showAmend && (
              <AmendmentForm poId={po.id} quantity={po.quantity} rate={po.rate} deliveryDate={po.delivery_completion_date} />
            )}
            {showGrn && <GrnForm poId={po.id} quantity={po.quantity} unit={po.unit} cumulative={cumulativeConfirmed} />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">GRN / SCN Entries</h2>
          {!grnEntries || grnEntries.length === 0 ? (
            <EmptyState message="No GRN/SCN entries recorded yet." />
          ) : (
            <>
              <p className="mb-space-2 text-size-4 text-muted-foreground">
                Cumulative confirmed: {cumulativeConfirmed.toFixed(2)} of {po.quantity} {po.unit}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grnEntries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.type}</TableCell>
                      <TableCell>{e.quantity_confirmed}</TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell>{formatDate(e.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Amendments</h2>
          {!amendments || amendments.length === 0 ? (
            <p className="text-muted-foreground">No amendments have been proposed for this PO.</p>
          ) : (
            <div className="flex flex-col gap-space-2">
              {amendments.map((a) => (
                <div key={a.id} className="rounded-md border border-border p-space-2">
                  <StatusBadge status={a.status} />
                  <FieldRow label="Quantity" value={`${a.previous_quantity} → ${a.new_quantity}`} />
                  <FieldRow label="Rate" value={`${a.previous_rate} → ${a.new_rate}`} />
                  <FieldRow label="Delivery Date" value={`${a.previous_delivery_date} → ${a.new_delivery_date}`} />
                  <FieldRow label="Reason" value={a.reason} />
                  <FieldRow label="Proposed" value={formatDate(a.created_at)} />
                  {a.status === 'Pending_Approval' && BUDGET_APPROVER_ROLES.includes(user.role) && (
                    <div className="mt-space-2 flex gap-2">
                      <Button type="button" size="sm" onClick={() => handleApproveAmendment(a.id)}>
                        Approve Amendment
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleRejectAmendment(a.id)}>
                        Reject Amendment
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
