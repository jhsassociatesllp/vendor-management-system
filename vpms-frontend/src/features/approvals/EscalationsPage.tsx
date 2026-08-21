import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ROUTES } from '@/lib/nav-config'
import { type InvoiceApproval, useEscalations } from '@/features/approvals/hooks'
import { useInvoices } from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { UrgencyChip } from '@/components/shared/UrgencyChip'

const APPROVER_ROLES = ['Accounts Executive', 'Dept. Manager', 'Partner / VP', 'Finance Team', 'System Admin']

export function EscalationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: escalations, isLoading } = useEscalations()
  const { data: invoices } = useInvoices()
  const { data: vendors } = useVendors()

  const invoiceById = new Map((invoices ?? []).map((inv) => [inv.id, inv]))
  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]))

  // cell (not accessorFn) so the lookup re-runs every render — accessorFn's result is
  // cached by TanStack Table's getValue() and can go stale if invoices/vendors resolve
  // after the first render, showing the raw ID fallback forever even once data arrives.
  const columns = useMemo<ColumnDef<InvoiceApproval>[]>(
    () => [
      {
        header: 'Invoice Number',
        id: 'invoiceNumber',
        cell: ({ row }) => invoiceById.get(row.original.invoice_id)?.invoice_number ?? row.original.invoice_id,
      },
      {
        header: 'Vendor',
        id: 'vendor',
        cell: ({ row }) => {
          const inv = invoiceById.get(row.original.invoice_id)
          return inv ? vendorNameById.get(inv.vendor_id) ?? inv.vendor_id : '—'
        },
      },
      { header: 'Level', accessorKey: 'level' },
      { header: 'Assigned Role', accessorKey: 'assigned_role' },
      {
        header: 'TAT',
        id: 'tat',
        cell: ({ row }) => <UrgencyChip dueDateIso={row.original.tat_due_at} thresholdDays={3} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, vendors],
  )

  if (!user || !APPROVER_ROLES.includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Escalations</h1>
      <DataTable
        columns={columns}
        data={escalations ?? []}
        isLoading={isLoading}
        emptyMessage="No escalations right now."
        onRowClick={(row) => navigate(ROUTES.invoiceApprovalDetail(row.invoice_id))}
      />
    </div>
  )
}
