import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ROUTES } from '@/lib/nav-config'
import { money } from '@/lib/utils'
import { usePaymentQueue } from '@/features/approvals/hooks'
import type { Invoice } from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UrgencyChip } from '@/components/shared/UrgencyChip'
import { Badge } from '@/components/ui/badge'

const FINANCE_ROLES = ['Finance Team', 'System Admin']

export function PaymentQueuePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: queue, isLoading } = usePaymentQueue()
  const { data: vendors } = useVendors()

  const vendorById = new Map((vendors ?? []).map((v) => [v.id, v]))

  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      { header: 'Invoice Number', accessorKey: 'invoice_number' },
      {
        header: 'Vendor',
        id: 'vendor',
        cell: ({ row }) => {
          const vendor = vendorById.get(row.original.vendor_id)
          if (!vendor) return row.original.vendor_id
          return (
            <span className="inline-flex items-center gap-2">
              {vendor.vendor_name} ({vendor.vendor_code})
              {vendor.msme_status && <Badge variant="neutral">MSME</Badge>}
            </span>
          )
        },
      },
      { header: 'Amount', id: 'amount', accessorFn: (row) => money(row.total_invoice_amount) },
      {
        header: 'Payment Due Date',
        id: 'dueDate',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            {row.original.payment_due_date ?? '—'}
            <UrgencyChip dueDateIso={row.original.payment_due_date} thresholdDays={7} />
          </span>
        ),
      },
      { header: 'Status', id: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendors],
  )

  if (!user || !FINANCE_ROLES.includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Payment Queue</h1>
      <DataTable
        columns={columns}
        data={queue ?? []}
        isLoading={isLoading}
        emptyMessage="Nothing in the payment queue."
        onRowClick={(row) => navigate(ROUTES.paymentRecordForm(row.id))}
      />
    </div>
  )
}
