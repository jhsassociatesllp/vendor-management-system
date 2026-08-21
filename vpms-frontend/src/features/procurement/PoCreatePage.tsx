import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError, apiFetch, friendlyMessage } from '@/lib/api-client'
import { ROUTES } from '@/lib/nav-config'
import {
  type Agreement,
  useAgreementRateCards,
  useAgreements,
  useBudgetAvailability,
  useBudgetHeads,
  useCreatePurchaseOrder,
} from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { BudgetBar } from '@/components/shared/BudgetBar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ItemCodeOption {
  id: string
  category: string
  sub_category: string
  description: string
}

/** Phase 3 UI's po-create.html — a cascading form (vendor → item code → covering
 * agreement → rate card → live budget bar), server-recomputed totals preview, and an
 * over-budget exception path. Mirrors po-create.js's imperative cascade exactly. */
export function PoCreatePage() {
  const navigate = useNavigate()
  const { data: vendors } = useVendors()
  const { data: agreements } = useAgreements()
  const { data: budgetHeads } = useBudgetHeads()
  const createPo = useCreatePurchaseOrder()

  const [vendorId, setVendorId] = useState('')
  const [itemCodeOptions, setItemCodeOptions] = useState<ItemCodeOption[]>([])
  const [itemCodeId, setItemCodeId] = useState('')
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null)
  const [budgetHeadId, setBudgetHeadId] = useState('')
  const { data: availability } = useBudgetAvailability(budgetHeadId || undefined)

  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [rate, setRate] = useState('')
  const [rateHint, setRateHint] = useState('Select an item code to pre-fill the rate from its active rate card.')
  const [rateDisabled, setRateDisabled] = useState(true)
  const [cardDefaultRate, setCardDefaultRate] = useState<string | null>(null)
  const [rateOverrideReason, setRateOverrideReason] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [validityDate, setValidityDate] = useState('')

  const [overBudget, setOverBudget] = useState(false)
  const [overBudgetMessage, setOverBudgetMessage] = useState('')
  const [requestException, setRequestException] = useState(false)
  const [justification, setJustification] = useState('')

  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: rateCards } = useAgreementRateCards(selectedAgreement?.id)

  // Vendor change → load that vendor's active item-code combinations, reset downstream state.
  useEffect(() => {
    setItemCodeId('')
    setSelectedAgreement(null)
    setCardDefaultRate(null)
    setRate('')
    setRateDisabled(true)
    if (!vendorId) {
      setItemCodeOptions([])
      return
    }
    apiFetch<ItemCodeOption[]>(`/api/v1/vendors/${vendorId}/item-codes`)
      .then(setItemCodeOptions)
      .catch(() => setItemCodeOptions([]))
  }, [vendorId])

  // Item code change → find the covering active agreement, then its rate card.
  useEffect(() => {
    setCardDefaultRate(null)
    setRate('')
    setRateDisabled(true)
    if (!vendorId || !itemCodeId || !agreements) {
      setSelectedAgreement(null)
      return
    }
    const covering = agreements.find(
      (a) => a.vendor_id === vendorId && a.status === 'Active' && a.covered_item_code_ids.includes(itemCodeId),
    )
    setSelectedAgreement(covering ?? null)
  }, [vendorId, itemCodeId, agreements])

  // Rate cards loaded for the selected agreement → pre-fill rate for this item code.
  useEffect(() => {
    if (!selectedAgreement || !rateCards) return
    const active = rateCards.find((rc) => rc.item_code_id === itemCodeId && rc.is_active)
    if (active && active.rate !== null) {
      setCardDefaultRate(active.rate)
      setRate(active.rate)
      setRateHint(`Pre-filled from the active rate card (₹${active.rate}). Change it to override, with a reason.`)
    } else {
      setRateHint('No active fixed rate on the rate card — enter a rate and a reason.')
    }
    setRateDisabled(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgreement, rateCards])

  const rateDiffersFromCard = rate !== '' && (cardDefaultRate === null || Number(rate) !== Number(cardDefaultRate))

  const gstRate = selectedAgreement ? Number(selectedAgreement.gst_rate) : null
  const qtyNum = Number(quantity)
  const rateNum = Number(rate)
  const hasPreview = qtyNum > 0 && rateNum > 0 && gstRate !== null
  const taxable = hasPreview ? qtyNum * rateNum : 0
  const gst = hasPreview ? (taxable * (gstRate as number)) / 100 : 0
  const total = hasPreview ? taxable + gst : 0

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')

    if (!selectedAgreement) {
      setFormError('Select a vendor and item code with an active covering agreement first.')
      return
    }
    if (rateDiffersFromCard && !rateOverrideReason.trim()) {
      setFormError('A reason is required when overriding the rate-card rate.')
      return
    }
    if (overBudget && requestException && !justification.trim()) {
      setFormError('Justification is required to request an over-budget exception.')
      return
    }

    setSubmitting(true)
    try {
      const po = await createPo.mutateAsync({
        vendor_id: vendorId,
        item_code_id: itemCodeId,
        agreement_id: selectedAgreement.id,
        description,
        quantity,
        rate: rate || null,
        rate_override_reason: rateDiffersFromCard ? rateOverrideReason.trim() : null,
        budget_head_id: budgetHeadId,
        delivery_completion_date: deliveryDate,
        po_validity_date: validityDate,
        over_budget_justification: overBudget && requestException ? justification.trim() : null,
      })
      navigate(ROUTES.poDetail(po.id))
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && /insufficient budget/i.test(friendlyMessage(err))) {
        setOverBudget(true)
        setOverBudgetMessage(friendlyMessage(err))
      } else {
        setFormError(friendlyMessage(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">New Purchase Order</h1>

      <Card className="mb-space-2">
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Vendor &amp; Item</h2>

          <Label htmlFor="vendor_id">Vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger id="vendor_id">
              <SelectValue placeholder="Select a vendor…" />
            </SelectTrigger>
            <SelectContent>
              {(vendors ?? [])
                .filter((v) => v.is_active !== false)
                .map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.vendor_name} ({v.vendor_code})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Label htmlFor="item_code_id">Item Code</Label>
          <Select value={itemCodeId} onValueChange={setItemCodeId} disabled={!vendorId}>
            <SelectTrigger id="item_code_id">
              <SelectValue placeholder={vendorId ? 'Select an item code…' : 'Select a vendor first…'} />
            </SelectTrigger>
            <SelectContent>
              {itemCodeOptions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.category} / {i.sub_category} — {i.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-size-5 text-muted-foreground">
            Only item codes with an active vendor-item combination are shown.
          </p>

          {vendorId && itemCodeId && !selectedAgreement && (
            <p className="mt-space-2 text-size-4 text-destructive">
              No active agreement covers this vendor/item combination — a PO cannot be created until one exists.
            </p>
          )}
          {selectedAgreement && (
            <p className="mt-space-2 text-size-4">
              Agreement: <strong>{selectedAgreement.agreement_number}</strong> (GST {selectedAgreement.gst_rate}%)
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-space-2">
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Budget Head</h2>
          <Label htmlFor="budget_head_id">Budget Head</Label>
          <Select value={budgetHeadId} onValueChange={setBudgetHeadId}>
            <SelectTrigger id="budget_head_id">
              <SelectValue placeholder="Select a budget head…" />
            </SelectTrigger>
            <SelectContent>
              {(budgetHeads ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.department} — {b.cost_centre} ({b.period_label})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availability && (
            <div className="mt-space-2">
              <BudgetBar sanctioned={Number(availability.sanctioned_amount)} committed={Number(availability.committed_amount)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-space-2">
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Quantity &amp; Rate</h2>

          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />

          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" type="number" min={0.01} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />

          <Label htmlFor="rate">Rate (INR)</Label>
          <Input
            id="rate"
            type="number"
            min={0.01}
            step="0.01"
            value={rate}
            disabled={rateDisabled}
            onChange={(e) => setRate(e.target.value)}
            required
          />
          <p className="mt-1 text-size-5 text-muted-foreground">{rateHint}</p>

          {rateDiffersFromCard && (
            <div className="mt-space-2">
              <Label htmlFor="rate_override_reason">Reason for rate override (required)</Label>
              <Textarea id="rate_override_reason" value={rateOverrideReason} onChange={(e) => setRateOverrideReason(e.target.value)} />
            </div>
          )}

          <Label htmlFor="delivery_completion_date">Delivery / Completion Date</Label>
          <Input id="delivery_completion_date" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} required />

          <Label htmlFor="po_validity_date">PO Validity Date</Label>
          <Input id="po_validity_date" type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} required />

          <div className="mt-space-3 rounded-md border border-border bg-background p-space-2">
            <div className="flex justify-between text-size-4">
              <span className="text-muted-foreground">Taxable Amount (preview)</span>
              <span>{hasPreview ? taxable.toFixed(2) : '—'}</span>
            </div>
            <div className="flex justify-between text-size-4">
              <span className="text-muted-foreground">GST (preview)</span>
              <span>{hasPreview ? gst.toFixed(2) : '—'}</span>
            </div>
            <div className="flex justify-between text-size-4">
              <span className="text-muted-foreground">Total incl. GST (preview)</span>
              <span>{hasPreview ? total.toFixed(2) : '—'}</span>
            </div>
            <p className="mt-1 text-size-5 text-muted-foreground">
              Server-recomputed and re-verified at submission — this is only a live preview.
            </p>
          </div>
        </CardContent>
      </Card>

      {overBudget && (
        <Card className="mb-space-2">
          <CardContent className="pt-space-3">
            <h2 className="mb-space-2 font-heading text-size-2 font-bold">Budget Exceeded</h2>
            <div className="mb-space-2 rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">{overBudgetMessage}</div>
            <div className="flex items-center gap-space-1">
              <Checkbox id="request-exception" checked={requestException} onCheckedChange={(v) => setRequestException(!!v)} />
              <Label htmlFor="request-exception" className="mb-0 mt-0 font-normal">
                Request an over-budget exception
              </Label>
            </div>
            {requestException && (
              <div className="mt-space-2">
                <Label htmlFor="over_budget_justification">Justification (required)</Label>
                <Textarea id="over_budget_justification" value={justification} onChange={(e) => setJustification(e.target.value)} />
                <p className="mt-1 text-size-5 text-muted-foreground">This still requires approval — it is not auto-approved.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {formError && <p className="mb-space-2 text-size-4 text-destructive">{formError}</p>}
      <Button type="submit" disabled={submitting}>
        Create Purchase Order
      </Button>
    </form>
  )
}
