import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '@/lib/nav-config'
import { type InvoiceApproval, useMyApprovalQueue } from '@/features/approvals/hooks'
import { useInvoices } from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { UrgencyChip } from '@/components/shared/UrgencyChip'

export function MyApprovalQueuePage() {
  const navigate = useNavigate()
  const { data: queue, isLoading } = useMyApprovalQueue()
  const { data: invoices } = useInvoices()
  const { data: vendors } = useVendors()

  const invoiceById = new Map((invoices ?? []).map((inv) => [inv.id, inv]))
  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]))

  const columns = useMemo<ColumnDef<InvoiceApproval>[]>(
    () => [
      {
        header: 'Invoice Number',
        id: 'invoiceNumber',
        // accessorFn (for sort) + cell (for display) — cell re-runs the lookup fresh every
        // render, since accessorFn's cached getValue() can go stale if invoices/vendors
        // resolve after the first render and leave the raw-ID fallback showing forever.
        accessorFn: (row) => invoiceById.get(row.invoice_id)?.invoice_number ?? row.invoice_id,
        cell: ({ row }) => invoiceById.get(row.original.invoice_id)?.invoice_number ?? row.original.invoice_id,
      },
      {
        header: 'Vendor',
        id: 'vendor',
        accessorFn: (row) => {
          const inv = invoiceById.get(row.invoice_id)
          return inv ? vendorNameById.get(inv.vendor_id) ?? inv.vendor_id : '—'
        },
        cell: ({ row }) => {
          const inv = invoiceById.get(row.original.invoice_id)
          return inv ? vendorNameById.get(inv.vendor_id) ?? inv.vendor_id : '—'
        },
      },
      {
        header: 'Amount',
        id: 'amount',
        accessorFn: (row) => invoiceById.get(row.invoice_id)?.total_invoice_amount ?? '—',
        cell: ({ row }) => invoiceById.get(row.original.invoice_id)?.total_invoice_amount ?? '—',
      },
      { header: 'Level', accessorKey: 'level' },
      {
        header: 'TAT',
        id: 'tat',
        cell: ({ row }) => <UrgencyChip dueDateIso={row.original.tat_due_at} thresholdDays={3} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, vendors],
  )

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">My Approvals</h1>
      <DataTable
        columns={columns}
        data={queue ?? []}
        isLoading={isLoading}
        emptyMessage="Nothing pending your action right now."
        onRowClick={(row) => navigate(ROUTES.invoiceApprovalDetail(row.invoice_id))}
      />
    </div>
  )
}
