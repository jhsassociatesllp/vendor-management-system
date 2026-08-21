import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '@/lib/nav-config'
import { formatDate } from '@/lib/utils'
import { type Invoice, useInvoices, usePurchaseOrders } from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FlagTags } from '@/components/shared/FlagTags'

export function InvoicesListPage() {
  const navigate = useNavigate()
  const { data: invoices, isLoading } = useInvoices()
  const { data: vendors } = useVendors()
  const { data: pos } = usePurchaseOrders()

  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]))
  const poNumberById = new Map((pos ?? []).map((p) => [p.id, p.po_number]))

  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      { header: 'Invoice Number', accessorKey: 'invoice_number' },
      {
        // accessorFn (for sort/search) + cell (for display) — cell re-runs the lookup
        // fresh every render, since accessorFn's cached getValue() can go stale if vendors
        // resolves after the first render and leave the raw ID showing forever.
        header: 'Vendor',
        id: 'vendor',
        accessorFn: (inv) => vendorNameById.get(inv.vendor_id) ?? inv.vendor_id,
        cell: ({ row }) => vendorNameById.get(row.original.vendor_id) ?? row.original.vendor_id,
      },
      {
        header: 'Purchase Order',
        id: 'po',
        accessorFn: (inv) => (inv.po_id ? poNumberById.get(inv.po_id) ?? inv.po_id : '— (Agreement-based)'),
        cell: ({ row }) => (row.original.po_id ? poNumberById.get(row.original.po_id) ?? row.original.po_id : '— (Agreement-based)'),
      },
      { header: 'Total Amount', accessorKey: 'total_invoice_amount' },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <>
            <StatusBadge status={row.original.status} />
            <FlagTags invoice={row.original} />
          </>
        ),
      },
      {
        header: 'Submitted',
        id: 'submitted',
        accessorFn: (inv) => (inv.status === 'Submitted' ? formatDate(inv.created_at) : '—'),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendors, pos],
  )

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Invoices</h1>
      <DataTable
        columns={columns}
        data={invoices ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search invoices…"
        emptyMessage="No invoices yet."
        onRowClick={(inv) => navigate(ROUTES.invoiceDetail(inv.id))}
      />
    </div>
  )
}
