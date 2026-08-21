import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ROUTES } from '@/lib/nav-config'
import { type PurchaseOrder, useBudgetHeads, usePurchaseOrders } from '@/features/procurement/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { useItemCodes } from '@/features/vendor/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link } from 'react-router-dom'

const CREATOR_ROLES = ['Dept. Manager', 'Accounts Executive', 'System Admin']
const STATUSES = ['Pending_Approval', 'Approved', 'Vendor_Acknowledged', 'Rejected', 'Cancelled', 'Lapsed']

export function PoListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')

  const { data: pos, isLoading } = usePurchaseOrders()
  const { data: vendors } = useVendors()
  const { data: itemCodes } = useItemCodes()
  const { data: budgetHeads } = useBudgetHeads()

  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]))
  const itemLabelById = new Map((itemCodes ?? []).map((i) => [i.id, `${i.category} / ${i.sub_category}`]))
  const budgetHeadLabelById = new Map((budgetHeads ?? []).map((b) => [b.id, `${b.department} (${b.period_label})`]))

  const rows = statusFilter ? (pos ?? []).filter((po) => po.status === statusFilter) : pos ?? []

  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(
    () => [
      { header: 'PO Number', accessorKey: 'po_number' },
      {
        // accessorFn (for sort/search) + cell (for display) — cell re-runs the lookup
        // fresh every render, since accessorFn's cached getValue() can go stale if
        // vendors/itemCodes/budgetHeads resolve after the first render and leave the raw
        // ID showing forever.
        header: 'Vendor',
        id: 'vendor',
        accessorFn: (po) => vendorNameById.get(po.vendor_id) ?? po.vendor_id,
        cell: ({ row }) => vendorNameById.get(row.original.vendor_id) ?? row.original.vendor_id,
      },
      {
        header: 'Item Code',
        id: 'item',
        accessorFn: (po) => itemLabelById.get(po.item_code_id) ?? po.item_code_id,
        cell: ({ row }) => itemLabelById.get(row.original.item_code_id) ?? row.original.item_code_id,
      },
      { header: 'Total (incl. GST)', accessorKey: 'total_po_value_incl_gst' },
      { header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        header: 'Budget Head',
        id: 'budgetHead',
        accessorFn: (po) => budgetHeadLabelById.get(po.budget_head_id) ?? po.budget_head_id,
        cell: ({ row }) => budgetHeadLabelById.get(row.original.budget_head_id) ?? row.original.budget_head_id,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendors, itemCodes, budgetHeads],
  )

  return (
    <div>
      <div className="mb-space-2 flex items-center justify-between">
        <h1 className="font-heading text-size-1 font-bold">Purchase Orders</h1>
        {user && CREATOR_ROLES.includes(user.role) && (
          <Button asChild>
            <Link to={ROUTES.poCreate}>New Purchase Order</Link>
          </Button>
        )}
      </div>

      <div className="mb-space-2 max-w-xs">
        <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search purchase orders…"
        emptyMessage="No purchase orders match this filter."
        onRowClick={(po) => navigate(ROUTES.poDetail(po.id))}
      />
    </div>
  )
}
