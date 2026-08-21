import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ROUTES } from '@/lib/nav-config'
import { formatDate } from '@/lib/utils'
import { type VendorRequest, useVendorRequests } from '@/features/vendor/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'

const TITLE_BY_ROLE: Record<string, string> = {
  'Dept. Manager': 'My Vendor Requests',
  'Partner / VP': 'Requests Pending Approval',
  'Accounts Executive': 'Requests Pending Review',
}

export function VendorRequestsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: requests, isLoading } = useVendorRequests()

  const columns = useMemo<ColumnDef<VendorRequest>[]>(
    () => [
      { header: 'Vendor Name', accessorKey: 'recommended_vendor_name' },
      { header: 'Category', accessorKey: 'category' },
      {
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        header: 'Created',
        accessorKey: 'created_at',
        cell: ({ row }) => formatDate(row.original.created_at),
      },
    ],
    [],
  )

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">
        {(user && TITLE_BY_ROLE[user.role]) || 'Vendor Requests'}
      </h1>
      <DataTable
        columns={columns}
        data={requests ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search vendor requests…"
        emptyMessage="No vendor requests to show."
        onRowClick={(row) => navigate(ROUTES.requestDetail(row.id))}
      />
    </div>
  )
}
