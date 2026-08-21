import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { friendlyMessage } from '@/lib/api-client'
import { ROUTES } from '@/lib/nav-config'
import {
  type Agreement,
  type PurchaseOrder,
  useAgreementMilestones,
  useAgreements,
  useCreateInvoice,
  usePoBalance,
  usePurchaseOrders,
  useSubmitInvoice,
  useUploadInvoiceDocument,
} from '@/features/procurement/hooks'
import { useItemCodes } from '@/features/vendor/hooks'
import { useProfileStatus } from '@/features/vendor-portal/hooks'
import { MultiStepForm } from '@/components/shared/MultiStepForm'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STEPS = ['Billing Basis', 'Amounts', 'Details', 'Documents', 'Review']
const MANDATORY_DOC_TYPES = ['Invoice_PDF', 'GRN_SCN_Ack', 'Work_Completion_Proof']
const OPTIONAL_DOC_TYPES = ['Timesheet', 'Measurement_Sheet', 'PO_Copy']

function DocUploadCard({ invoiceId, docType, required, uploaded, onUploaded }: {
  invoiceId: string
  docType: string
  required: boolean
  uploaded?: { uploaded_at: string }
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const upload = useUploadInvoiceDocument(invoiceId)

  async function handleUpload() {
    setError('')
    if (!file) {
      setError('Choose a file first.')
      return
    }
    try {
      await upload.mutateAsync({ documentType: docType, file })
      onUploaded()
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="pt-space-3">
        <h3 className="mb-1 text-size-3 font-semibold">
          {docType.replace(/_/g, ' ')}{' '}
          {required ? (
            <span className="text-size-5 font-semibold text-destructive">Required</span>
          ) : (
            <span className="text-size-5 font-normal text-muted-foreground">Optional</span>
          )}
        </h3>
        {uploaded && <p className="mb-1 text-size-5 text-muted-foreground">Uploaded {new Date(uploaded.uploaded_at).toLocaleString()}</p>}
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-size-4" />
        {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
        <div>
          <Button type="button" variant="outline" className="mt-space-2" onClick={handleUpload} disabled={upload.isPending}>
            {uploaded ? 'Re-upload' : 'Upload'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Phase 3 UI's vendor-invoice-submit.html — a 5-step invoice submission wizard.
 * Mirrors vendor-invoice-submit.js's state machine and per-step validation exactly. */
export function VendorInvoiceSubmitPage() {
  const navigate = useNavigate()
  const { data: status } = useProfileStatus()
  const { data: allPos } = usePurchaseOrders()
  const { data: allAgreements } = useAgreements()
  const { data: allItemCodes } = useItemCodes()
  const createInvoice = useCreateInvoice()

  const [step, setStep] = useState(1)
  const [billingMode, setBillingMode] = useState<'po' | 'agreement'>('po')
  const [poId, setPoId] = useState('')
  const [agreementId, setAgreementId] = useState('')
  const [itemCodeId, setItemCodeId] = useState('')
  const [step1Error, setStep1Error] = useState('')

  const [quantity, setQuantity] = useState('')
  const [rate, setRate] = useState('')
  const [cgst, setCgst] = useState('')
  const [sgst, setSgst] = useState('')
  const [igst, setIgst] = useState('')
  const [step2Error, setStep2Error] = useState('')

  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [workDescription, setWorkDescription] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [step3Error, setStep3Error] = useState('')

  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { uploaded_at: string }>>({})
  const [step5Error, setStep5Error] = useState('')
  const [nextLoading, setNextLoading] = useState(false)

  const submitInvoice = useSubmitInvoice(invoiceId ?? '')

  const vendorId = status?.vendor_id
  const ownPos = (allPos ?? []).filter((po) => po.vendor_id === vendorId && po.status === 'Vendor_Acknowledged')
  const ownAgreements = (allAgreements ?? []).filter((a) => a.vendor_id === vendorId && a.status === 'Active')

  const selectedPo: PurchaseOrder | null = ownPos.find((po) => po.id === poId) ?? null
  const selectedAgreementDirect: Agreement | null = ownAgreements.find((a) => a.id === agreementId) ?? null
  const activeAgreement: Agreement | null =
    billingMode === 'po' ? (allAgreements ?? []).find((a) => a.id === selectedPo?.agreement_id) ?? null : selectedAgreementDirect

  const { data: poBalance } = usePoBalance(billingMode === 'po' ? selectedPo?.id : undefined)
  const { data: milestones } = useAgreementMilestones(
    activeAgreement?.billing_frequency === 'Milestone' ? activeAgreement.id : undefined,
  )

  const coveredItemCodes = selectedAgreementDirect
    ? (allItemCodes ?? []).filter((i) => selectedAgreementDirect.covered_item_code_ids.includes(i.id))
    : []

  useEffect(() => {
    setItemCodeId('')
  }, [agreementId])

  const qtyNum = Number(quantity) || 0
  const rateNum = Number(rate) || 0
  const cgstNum = Number(cgst) || 0
  const sgstNum = Number(sgst) || 0
  const igstNum = Number(igst) || 0
  const taxable = qtyNum * rateNum
  const actualGst = cgstNum + sgstNum + igstNum
  const total = taxable + actualGst

  let gstWarning = ''
  if (activeAgreement && taxable > 0) {
    const expectedGst = (taxable * Number(activeAgreement.gst_rate)) / 100
    const delta = Math.abs(actualGst - expectedGst)
    if (delta > 1) {
      gstWarning = `Your GST breakup (₹${actualGst.toFixed(2)}) differs from the expected GST at this agreement's ${activeAgreement.gst_rate}% rate (₹${expectedGst.toFixed(2)}) by more than ₹1. Correct this before submitting, or the server will reject it.`
    }
  }

  function validateStep1(): boolean {
    setStep1Error('')
    if (billingMode === 'po') {
      if (!selectedPo) {
        setStep1Error('Select a Purchase Order.')
        return false
      }
    } else {
      if (!selectedAgreementDirect) {
        setStep1Error('Select an Agreement.')
        return false
      }
      if (!itemCodeId) {
        setStep1Error('Select an item code.')
        return false
      }
    }
    return true
  }

  function validateStep2(): boolean {
    setStep2Error('')
    if (!qtyNum || qtyNum <= 0) {
      setStep2Error('Enter a quantity greater than 0.')
      return false
    }
    if (!rateNum || rateNum <= 0) {
      setStep2Error('Enter a rate greater than 0.')
      return false
    }
    return true
  }

  function validateStep3(): boolean {
    setStep3Error('')
    if (!invoiceNumber.trim()) {
      setStep3Error('Enter your invoice number.')
      return false
    }
    if (!invoiceDate) {
      setStep3Error('Invoice date is required.')
      return false
    }
    if (!periodFrom || !periodTo) {
      setStep3Error("Period of service (both dates) is required.")
      return false
    }
    if (periodTo < periodFrom) {
      setStep3Error("Period of service 'to' date must be on or after 'from' date.")
      return false
    }
    if (!workDescription.trim()) {
      setStep3Error('Work description is required.')
      return false
    }
    if (activeAgreement?.billing_frequency === 'Milestone' && !milestoneId) {
      setStep3Error('This agreement bills by milestone — select one.')
      return false
    }
    return true
  }

  async function ensureInvoiceCreated(): Promise<boolean> {
    if (invoiceId) return true
    try {
      const invoice = await createInvoice.mutateAsync({
        invoice_number: invoiceNumber.trim(),
        po_id: billingMode === 'po' ? selectedPo!.id : null,
        agreement_id: billingMode === 'po' ? selectedPo!.agreement_id : selectedAgreementDirect!.id,
        item_code_id: billingMode === 'po' ? selectedPo!.item_code_id : itemCodeId,
        invoice_date: invoiceDate,
        quantity,
        rate,
        cgst_amount: cgst || '0',
        sgst_amount: sgst || '0',
        igst_amount: igst || '0',
        total_invoice_amount: total.toFixed(2),
        period_service_from: periodFrom,
        period_service_to: periodTo,
        billing_milestone_id: milestoneId || null,
        work_description: workDescription,
      })
      setInvoiceId(invoice.id)
      return true
    } catch (err) {
      setStep3Error(friendlyMessage(err))
      return false
    }
  }

  async function handleNext() {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    if (step === 3) {
      if (!validateStep3()) return
      setNextLoading(true)
      const created = await ensureInvoiceCreated()
      setNextLoading(false)
      if (!created) return
    }
    setStep((s) => s + 1)
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1))
  }

  async function handleFinalSubmit() {
    setStep5Error('')
    try {
      await submitInvoice.mutateAsync()
      toast.success('Invoice submitted successfully.')
      navigate(ROUTES.invoiceDetail(invoiceId!))
    } catch (err) {
      setStep5Error(friendlyMessage(err))
    }
  }

  const uploadedTypes = Object.keys(uploadedDocs)
  const missingMandatory = MANDATORY_DOC_TYPES.filter((t) => !uploadedTypes.includes(t))

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Submit Invoice</h1>
      <MultiStepForm
        steps={STEPS}
        currentStep={step - 1}
        onBack={handleBack}
        onNext={handleNext}
        onSubmit={handleFinalSubmit}
        isNextDisabled={nextLoading}
        isSubmitting={submitInvoice.isPending}
        submitLabel="Submit Invoice"
      >
        {step === 1 && (
          <Card>
            <CardContent className="flex flex-col gap-space-2 pt-space-3">
              <div className="flex gap-space-3">
                <label className="flex items-center gap-1.5 text-size-4">
                  <input type="radio" checked={billingMode === 'po'} onChange={() => setBillingMode('po')} />
                  Bill against a Purchase Order
                </label>
                <label className="flex items-center gap-1.5 text-size-4">
                  <input type="radio" checked={billingMode === 'agreement'} onChange={() => setBillingMode('agreement')} />
                  Bill against an Agreement (no PO)
                </label>
              </div>

              {billingMode === 'po' ? (
                <div>
                  <Label htmlFor="po_id">Purchase Order</Label>
                  <Select value={poId} onValueChange={setPoId}>
                    <SelectTrigger id="po_id">
                      <SelectValue placeholder={ownPos.length === 0 ? 'No Vendor_Acknowledged POs available' : 'Select a PO…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {ownPos.map((po) => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number} — {po.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {poBalance && (
                    <div className="mt-space-2 rounded-md border border-border bg-background p-space-2 text-size-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining Value</span>
                        <span>₹{poBalance.remaining_value}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining Quantity</span>
                        <span>
                          {poBalance.remaining_quantity} {selectedPo?.unit}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="agreement_id">Agreement</Label>
                  <Select value={agreementId} onValueChange={setAgreementId}>
                    <SelectTrigger id="agreement_id">
                      <SelectValue placeholder={ownAgreements.length === 0 ? 'No active agreements for this vendor' : 'Select an agreement…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {ownAgreements.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.agreement_number} — {a.scope_of_work}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Label htmlFor="item_code_id">Item Code</Label>
                  <Select value={itemCodeId} onValueChange={setItemCodeId} disabled={!selectedAgreementDirect}>
                    <SelectTrigger id="item_code_id">
                      <SelectValue placeholder={selectedAgreementDirect ? 'Select an item code…' : 'Select an agreement first…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {coveredItemCodes.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.category} / {i.sub_category} — {i.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {step1Error && <p className="text-size-5 text-destructive">{step1Error}</p>}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardContent className="flex flex-col gap-space-2 pt-space-3">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <Label htmlFor="rate">Rate</Label>
              <Input id="rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
              <Label htmlFor="cgst_amount">CGST Amount</Label>
              <Input id="cgst_amount" type="number" value={cgst} onChange={(e) => setCgst(e.target.value)} />
              <Label htmlFor="sgst_amount">SGST Amount</Label>
              <Input id="sgst_amount" type="number" value={sgst} onChange={(e) => setSgst(e.target.value)} />
              <Label htmlFor="igst_amount">IGST Amount</Label>
              <Input id="igst_amount" type="number" value={igst} onChange={(e) => setIgst(e.target.value)} />

              <div className="rounded-md border border-border bg-background p-space-2 text-size-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxable Amount</span>
                  <span>{taxable ? taxable.toFixed(2) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span>{total ? total.toFixed(2) : '—'}</span>
                </div>
              </div>
              {gstWarning && <p className="rounded-md bg-warning-bg px-3 py-2 text-size-4 text-warning">{gstWarning}</p>}
              {step2Error && <p className="text-size-5 text-destructive">{step2Error}</p>}
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardContent className="flex flex-col gap-space-2 pt-space-3">
              <Label htmlFor="invoice_number">Invoice Number</Label>
              <Input id="invoice_number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              <Label htmlFor="invoice_date">Invoice Date</Label>
              <Input id="invoice_date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              <Label htmlFor="period_service_from">Period of Service (From)</Label>
              <Input id="period_service_from" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
              <Label htmlFor="period_service_to">Period of Service (To)</Label>
              <Input id="period_service_to" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
              <Label htmlFor="work_description">Work Description</Label>
              <Textarea id="work_description" value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} />

              {activeAgreement?.billing_frequency === 'Milestone' && (
                <div>
                  <Label htmlFor="billing_milestone_id">Billing Milestone</Label>
                  <Select value={milestoneId} onValueChange={setMilestoneId}>
                    <SelectTrigger id="billing_milestone_id">
                      <SelectValue placeholder="Select a milestone…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(milestones ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {step3Error && <p className="text-size-5 text-destructive">{step3Error}</p>}
            </CardContent>
          </Card>
        )}

        {step === 4 && invoiceId && (
          <div className="flex flex-col gap-space-2">
            {[...MANDATORY_DOC_TYPES.map((t) => ({ type: t, required: true })), ...OPTIONAL_DOC_TYPES.map((t) => ({ type: t, required: false }))].map(
              ({ type, required }) => (
                <DocUploadCard
                  key={type}
                  invoiceId={invoiceId}
                  docType={type}
                  required={required}
                  uploaded={uploadedDocs[type]}
                  onUploaded={() => setUploadedDocs((prev) => ({ ...prev, [type]: { uploaded_at: new Date().toISOString() } }))}
                />
              ),
            )}
          </div>
        )}

        {step === 5 && (
          <Card>
            <CardContent className="flex flex-col gap-1 pt-space-3">
              {[
                ['Invoice Number', invoiceNumber],
                ['Billing basis', billingMode === 'po' ? `PO ${selectedPo?.po_number}` : `Agreement ${activeAgreement?.agreement_number} (no PO)`],
                ['Quantity', quantity],
                ['Rate', rate],
                ['Taxable Amount', taxable.toFixed(2)],
                ['CGST / SGST / IGST', `${cgst || 0} / ${sgst || 0} / ${igst || 0}`],
                ['Total Invoice Amount', total.toFixed(2)],
                ['Invoice Date', invoiceDate],
                ['Period of Service', `${periodFrom} — ${periodTo}`],
                ['Work Description', workDescription],
                ['Documents Uploaded', uploadedTypes.length ? uploadedTypes.join(', ') : 'None'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-border py-1.5 text-size-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-right font-medium">{value}</span>
                </div>
              ))}
              {missingMandatory.length > 0 && (
                <p className="mt-space-2 rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
                  Missing mandatory documents: {missingMandatory.join(', ')}. Submission will be blocked until these are uploaded.
                </p>
              )}
              {step5Error && <p className="text-size-5 text-destructive">{step5Error}</p>}
            </CardContent>
          </Card>
        )}
      </MultiStepForm>
    </div>
  )
}
