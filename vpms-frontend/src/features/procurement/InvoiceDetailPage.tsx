import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage, openAuthenticatedFile } from '@/lib/api-client'
import { ROUTES } from '@/lib/nav-config'
import {
  useAgreement,
  useAgreementMilestones,
  useInvoice,
  useInvoiceDocuments,
  usePurchaseOrder,
  useRouteInvoiceForApproval,
} from '@/features/procurement/hooks'
import { useItemCodes, useVendors } from '@/features/vendor/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FlagTags } from '@/components/shared/FlagTags'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'

const ROUTE_ROLES = ['Accounts Executive', 'System Admin']

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-space-3 border-b border-border py-2 text-size-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: invoice, isLoading, error } = useInvoice(id)
  const { data: vendors } = useVendors()
  const { data: itemCodes } = useItemCodes()
  const { data: agreement } = useAgreement(invoice?.agreement_id)
  const { data: po } = usePurchaseOrder(invoice?.po_id ?? undefined)
  const { data: milestones } = useAgreementMilestones(invoice?.billing_milestone_id ? invoice.agreement_id : undefined)
  const { data: documents } = useInvoiceDocuments(id)
  const routeForApproval = useRouteInvoiceForApproval(id ?? '')

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error || !invoice) {
    return <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">Invoice not found.</div>
  }
  if (!user) return null

  const vendor = vendors?.find((v) => v.id === invoice.vendor_id)
  const item = itemCodes?.find((i) => i.id === invoice.item_code_id)
  const milestone = milestones?.find((m) => m.id === invoice.billing_milestone_id)
  const inApprovalWorkflow = !['Draft', 'Submitted'].includes(invoice.status)

  async function handleRoute() {
    try {
      await routeForApproval.mutateAsync()
      toast.success('Invoice routed for approval.')
      navigate(ROUTES.invoiceApprovalDetail(id))
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleViewDoc(documentId: string) {
    try {
      await openAuthenticatedFile(`/api/v1/invoices/documents/${documentId}/file`)
    } catch {
      toast.error('Could not open the file.')
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <Card>
        <CardContent className="pt-space-3">
          <h1 className="mb-space-2 font-heading text-size-1 font-bold">Invoice</h1>
          <FieldRow label="Invoice Number" value={invoice.invoice_number} />
          <FieldRow
            label="Status"
            value={
              <span className="inline-flex items-center gap-2">
                <StatusBadge status={invoice.status} />
                <FlagTags invoice={invoice} />
                {inApprovalWorkflow && (
                  <Link to={ROUTES.invoiceApprovalDetail(invoice.id)} className="text-primary hover:underline">
                    View approval status
                  </Link>
                )}
              </span>
            }
          />
          <FieldRow label="Vendor" value={vendor ? `${vendor.vendor_name} (${vendor.vendor_code})` : invoice.vendor_id} />
          <FieldRow label="Item Code" value={item ? `${item.category} / ${item.sub_category} — ${item.description}` : invoice.item_code_id} />
          <FieldRow label="Agreement" value={agreement?.agreement_number ?? invoice.agreement_id} />
          <FieldRow
            label="Purchase Order"
            value={
              invoice.po_id ? (
                po ? (
                  <Link to={ROUTES.poDetail(po.id)} className="text-primary hover:underline">
                    {po.po_number}
                  </Link>
                ) : (
                  invoice.po_id
                )
              ) : (
                '— (Agreement-based)'
              )
            }
          />
          <FieldRow label="Invoice Date" value={invoice.invoice_date} />
          <FieldRow label="Work Description" value={invoice.work_description} />
          <FieldRow label="Submitted" value={invoice.status === 'Submitted' ? formatDate(invoice.created_at) : '— (Draft)'} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Amounts</h2>
          <FieldRow label="Quantity" value={invoice.quantity} />
          <FieldRow label="Rate" value={invoice.rate} />
          <FieldRow label="Taxable Amount" value={invoice.taxable_amount} />
          <FieldRow label="CGST" value={invoice.cgst_amount} />
          <FieldRow label="SGST" value={invoice.sgst_amount} />
          <FieldRow label="IGST" value={invoice.igst_amount} />
          <FieldRow label="Total GST" value={invoice.total_gst_amount} />
          <FieldRow label="Total Invoice Amount" value={invoice.total_invoice_amount} />
          <FieldRow label="GST Mismatch Delta" value={invoice.gst_mismatch_delta} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Period</h2>
          <FieldRow label="Period of Service" value={`${invoice.period_service_from} — ${invoice.period_service_to}`} />
          <FieldRow label="Billing Milestone" value={invoice.billing_milestone_id ? milestone?.description ?? invoice.billing_milestone_id : '—'} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Documents</h2>
          {!documents || documents.length === 0 ? (
            <EmptyState message="No documents uploaded." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>{doc.document_type.replace(/_/g, ' ')}</TableCell>
                    <TableCell>
                      {doc.is_mandatory ? (
                        <span className="text-size-5 font-semibold text-destructive">Required</span>
                      ) : (
                        <span className="text-size-5 font-semibold text-muted-foreground">Optional</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(doc.uploaded_at)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleViewDoc(doc.id)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {ROUTE_ROLES.includes(user.role) && invoice.status === 'Submitted' && (
        <Card>
          <CardContent className="pt-space-3">
            <p className="mb-space-2 text-size-4 text-muted-foreground">
              This invoice is Submitted and ready to enter the approval workflow.
            </p>
            <Button type="button" onClick={handleRoute} disabled={routeForApproval.isPending}>
              Route for Approval
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
