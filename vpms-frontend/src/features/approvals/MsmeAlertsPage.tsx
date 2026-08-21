import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ROUTES } from '@/lib/nav-config'
import { type MsmeAlert, useMsmeAlerts } from '@/features/approvals/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { EmptyState } from '@/components/shared/EmptyState'
import { UrgencyChip } from '@/components/shared/UrgencyChip'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const FINANCE_ROLES = ['Finance Team', 'System Admin']

function AlertTable({ alerts, vendorNameById, emptyMessage, onRowClick }: { alerts: MsmeAlert[]; vendorNameById: Map<string, string>; emptyMessage: string; onRowClick: (invoiceId: string) => void }) {
  if (alerts.length === 0) return <EmptyState message={emptyMessage} />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice Number</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Payment Due Date</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((a) => (
          <TableRow key={a.invoice_id} className="cursor-pointer" onClick={() => onRowClick(a.invoice_id)}>
            <TableCell>{a.invoice_number}</TableCell>
            <TableCell>{vendorNameById.get(a.vendor_id) ?? a.vendor_id}</TableCell>
            <TableCell>{a.payment_due_date}</TableCell>
            <TableCell>
              <UrgencyChip dueDateIso={a.payment_due_date} thresholdDays={7} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function MsmeAlertsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: alerts, isLoading } = useMsmeAlerts()
  const { data: vendors } = useVendors()

  if (!user || !FINANCE_ROLES.includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]))
  const overdue = (alerts ?? []).filter((a) => a.alert_type === 'Overdue')
  const atRisk = (alerts ?? []).filter((a) => a.alert_type === 'At_Risk')
  const handleRowClick = (invoiceId: string) => navigate(ROUTES.paymentRecordForm(invoiceId))

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">MSME Alerts</h1>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Overdue</h2>
          {isLoading ? <p className="text-muted-foreground">Loading…</p> : <AlertTable alerts={overdue} vendorNameById={vendorNameById} emptyMessage="No overdue MSME invoices." onRowClick={handleRowClick} />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">At Risk</h2>
          {isLoading ? <p className="text-muted-foreground">Loading…</p> : <AlertTable alerts={atRisk} vendorNameById={vendorNameById} emptyMessage="No at-risk MSME invoices." onRowClick={handleRowClick} />}
        </CardContent>
      </Card>
    </div>
  )
}
