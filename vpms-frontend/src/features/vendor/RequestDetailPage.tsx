import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import {
  useAccountsReview,
  useCreateVendorFromRequest,
  useItemCodes,
  useLinkItemCodes,
  usePartnerDecision,
  useVendorRequest,
  useVendors,
} from '@/features/vendor/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ACCOUNTS_REVIEWABLE_STATUSES = ['Submitted', 'Accounts_Review']
const ACCOUNTS_ROLES = ['Accounts Executive', 'System Admin']
const PARTNER_ROLES = ['Partner / VP', 'System Admin']

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-space-3 border-b border-border py-2 text-size-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

function yesNo(v: boolean) {
  return v ? 'Yes' : 'No'
}

function RejectBox({ onConfirm }: { onConfirm: (reason: string) => void }) {
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
      <Label htmlFor="reject-reason">Rejection Reason (required)</Label>
      <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      <div className="mt-space-2 flex gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            const trimmed = reason.trim()
            if (!trimmed) {
              setError('Rejection reason is required.')
              return;
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

function AccountsReviewActions({ requestId }: { requestId: string }) {
  const mutation = useAccountsReview(requestId)

  async function run(action: 'advance' | 'reject', reason?: string) {
    try {
      await mutation.mutateAsync({ action, rejection_reason: reason ?? null })
      toast.success(action === 'advance' ? 'Request advanced to Pending Partner Approval.' : 'Request rejected.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button type="button" onClick={() => run('advance')} disabled={mutation.isPending}>
        Advance to Partner Approval
      </Button>
      <RejectBox onConfirm={(reason) => run('reject', reason)} />
    </div>
  )
}

function PartnerDecisionActions({ requestId }: { requestId: string }) {
  const mutation = usePartnerDecision(requestId)

  async function run(action: 'approve' | 'reject', reason?: string) {
    try {
      await mutation.mutateAsync({ action, rejection_reason: reason ?? null })
      toast.success(action === 'approve' ? 'Request approved.' : 'Request rejected.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button type="button" onClick={() => run('approve')} disabled={mutation.isPending}>
        Approve
      </Button>
      <RejectBox onConfirm={(reason) => run('reject', reason)} />
    </div>
  )
}

const VENDOR_CATEGORIES = ['Professional', 'Service', 'Goods Supplier', 'Recurring']

function ItemCodeLinking({ vendorId }: { vendorId: string }) {
  const { data: itemCodes, isLoading } = useItemCodes()
  const linkMutation = useLinkItemCodes(vendorId)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  if (isLoading) return <p className="text-muted-foreground">Loading item codes…</p>
  if (!itemCodes || itemCodes.length === 0) {
    return <EmptyState message="No item codes exist yet." description="Create one on the Item Codes page first." />
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleLink() {
    setError('')
    if (selected.size === 0) {
      setError('Select at least one item code to link.')
      return
    }
    try {
      await linkMutation.mutateAsync(Array.from(selected))
      toast.success('Item code(s) linked to vendor.')
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  return (
    <div>
      {itemCodes.map((item) => (
        <div key={item.id} className="mt-space-1 flex items-center gap-space-1">
          <Checkbox
            id={`item-${item.id}`}
            checked={selected.has(item.id)}
            onCheckedChange={() => toggle(item.id)}
          />
          <Label htmlFor={`item-${item.id}`} className="mb-0 mt-0 font-normal">
            {item.category} / {item.sub_category} — {item.description}
          </Label>
        </div>
      ))}
      {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      <Button type="button" className="mt-space-2" onClick={handleLink} disabled={linkMutation.isPending}>
        Link Selected
      </Button>
    </div>
  )
}

function VendorCreationForm({ requestId }: { requestId: string }) {
  const createVendor = useCreateVendorFromRequest(requestId)
  const [category, setCategory] = useState('Professional')
  const [isMsme, setIsMsme] = useState(false)
  const [udyamNumber, setUdyamNumber] = useState('')
  const [bankAccountNo, setBankAccountNo] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [chequeFile, setChequeFile] = useState<File | null>(null)
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [error, setError] = useState('')
  const [createdVendor, setCreatedVendor] = useState<Awaited<ReturnType<typeof createVendor.mutateAsync>> | null>(null)

  async function handleCreate() {
    setError('')
    if (!chequeFile) {
      setError('Please choose a cancelled cheque file.')
      return
    }
    try {
      const vendor = await createVendor.mutateAsync({
        vendor_category: category,
        msme_status: isMsme,
        udyam_number: isMsme ? udyamNumber.trim() || null : null,
        bank_account_no: bankAccountNo,
        ifsc_code: ifscCode.trim().toUpperCase(),
        // Stub only (per backend Section 3.2): no real file storage this phase, just a
        // reference string built from the chosen file's name.
        cancelled_cheque_doc_url: `/uploads/cancelled-cheques/${chequeFile.name}`,
        address,
        email,
        mobile_number: mobileNumber.trim(),
      })
      setCreatedVendor(vendor)
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  if (createdVendor) {
    return (
      <div>
        <div className="mb-space-2 font-heading text-size-1 font-bold text-primary">{createdVendor.vendor_code}</div>
        <FieldRow label="Vendor Name" value={createdVendor.vendor_name} />
        <FieldRow label="Bank" value={`${createdVendor.bank_name} — ${createdVendor.bank_branch}`} />
        <FieldRow label="TDS Section" value={createdVendor.tds_section} />
        <h3 className="mt-space-3 text-size-3 font-semibold">Link Item Codes</h3>
        <ItemCodeLinking vendorId={createdVendor.id} />
      </div>
    )
  }

  return (
    <div>
      <Label htmlFor="vendor_category">Vendor Category</Label>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger id="vendor_category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VENDOR_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mt-space-2 flex items-center gap-space-1">
        <Checkbox id="msme_status" checked={isMsme} onCheckedChange={(v) => setIsMsme(!!v)} />
        <Label htmlFor="msme_status" className="mb-0 mt-0 font-normal">
          Vendor is MSME registered
        </Label>
      </div>
      <Label htmlFor="udyam_number">Udyam Number</Label>
      <Input id="udyam_number" disabled={!isMsme} value={udyamNumber} onChange={(e) => setUdyamNumber(e.target.value)} />

      <Label htmlFor="bank_account_no">Bank Account No.</Label>
      <Input id="bank_account_no" value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} />

      <Label htmlFor="ifsc_code">IFSC Code</Label>
      <Input
        id="ifsc_code"
        placeholder="HDFC0001234"
        maxLength={11}
        value={ifscCode}
        onChange={(e) => setIfscCode(e.target.value)}
      />
      <p className="mt-1 text-size-5 text-muted-foreground">Bank name and branch are auto-populated from this code.</p>

      <Label htmlFor="cancelled_cheque_doc_url">Cancelled Cheque Document</Label>
      <Input
        id="cancelled_cheque_doc_url"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => setChequeFile(e.target.files?.[0] ?? null)}
      />
      <p className="mt-1 text-size-5 text-muted-foreground">
        This phase stores only a stub reference to the file name — no real file storage yet.
      </p>

      <Label htmlFor="address">Address</Label>
      <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} />

      <Label htmlFor="vendor_email">Email</Label>
      <Input id="vendor_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

      <Label htmlFor="mobile_number">Mobile Number</Label>
      <Input id="mobile_number" maxLength={10} value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} />

      {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      <Button type="button" className="mt-space-2" onClick={handleCreate} disabled={createVendor.isPending}>
        Create Vendor Code
      </Button>
    </div>
  )
}

/** Phase 1 UI's vendor-request-detail workflow screen. Mirrors request-detail.js's four
 * branches exactly: accounts review actions, partner decision actions, vendor creation
 * (or the already-created vendor + item code linking), or none of the above. */
export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: request, isLoading, error } = useVendorRequest(id)
  const { data: vendors } = useVendors()

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error || !request) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        Vendor request not found.
      </div>
    )
  }
  if (!user) return null

  const existingVendor = vendors?.find((v) => v.source_request_id === request.id) ?? null

  const showAccountsReview =
    ACCOUNTS_ROLES.includes(user.role) && ACCOUNTS_REVIEWABLE_STATUSES.includes(request.status)
  const showPartnerDecision = PARTNER_ROLES.includes(user.role) && request.status === 'Pending_Partner_Approval'
  const showVendorCreation = ACCOUNTS_ROLES.includes(user.role) && request.status === 'Approved'

  return (
    <div className="flex flex-col gap-space-2">
      <Card>
        <CardContent className="pt-space-3">
          <h1 className="mb-space-2 font-heading text-size-1 font-bold">Vendor Request</h1>
          <FieldRow label="Status" value={<StatusBadge status={request.status} />} />
          <FieldRow label="Recommended Vendor Name" value={request.recommended_vendor_name} />
          <FieldRow label="Category" value={request.category} />
          <FieldRow label="Estimated Annual Spend" value={request.estimated_annual_spend} />
          <FieldRow label="Recommended PAN" value={request.recommended_pan} />
          <FieldRow label="Recommended GSTIN" value={request.recommended_gstin || '—'} />
          <FieldRow label="Business Need" value={request.business_need} />
          <FieldRow label="Financial Stability OK" value={yesNo(request.financial_stability_ok)} />
          <FieldRow label="Technical Capability OK" value={yesNo(request.technical_capability_ok)} />
          <FieldRow label="Compliance Status OK" value={yesNo(request.compliance_status_ok)} />
          <FieldRow label="Blacklist Check OK" value={yesNo(request.blacklist_check_ok)} />
          <FieldRow label="Conflict of Interest Declared" value={yesNo(request.conflict_of_interest_declared)} />
          <FieldRow label="References Provided" value={yesNo(request.references_provided)} />
          <FieldRow label="MSME/Udyam Number" value={request.msme_udyam_number || '—'} />
          <FieldRow label="Created" value={formatDate(request.created_at)} />
          {request.accounts_reviewed_at && (
            <FieldRow label="Accounts Reviewed At" value={formatDate(request.accounts_reviewed_at)} />
          )}
          {request.partner_decided_at && (
            <FieldRow label="Partner Decision At" value={formatDate(request.partner_decided_at)} />
          )}
          {request.rejection_reason && <FieldRow label="Rejection Reason" value={request.rejection_reason} />}
        </CardContent>
      </Card>

      {showAccountsReview && (
        <Card>
          <CardContent className="pt-space-3">
            <AccountsReviewActions requestId={request.id} />
          </CardContent>
        </Card>
      )}
      {showPartnerDecision && (
        <Card>
          <CardContent className="pt-space-3">
            <PartnerDecisionActions requestId={request.id} />
          </CardContent>
        </Card>
      )}
      {showVendorCreation && (
        <Card>
          <CardContent className="pt-space-3">
            {existingVendor ? (
              <div>
                <div className="mb-space-2 font-heading text-size-1 font-bold text-primary">
                  {existingVendor.vendor_code}
                </div>
                <FieldRow label="Vendor Name" value={existingVendor.vendor_name} />
                <FieldRow label="Bank" value={`${existingVendor.bank_name} — ${existingVendor.bank_branch}`} />
                <FieldRow label="TDS Section" value={existingVendor.tds_section} />
                <h3 className="mt-space-3 text-size-3 font-semibold">Link Item Codes</h3>
                <ItemCodeLinking vendorId={existingVendor.id} />
              </div>
            ) : (
              <VendorCreationForm requestId={request.id} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
