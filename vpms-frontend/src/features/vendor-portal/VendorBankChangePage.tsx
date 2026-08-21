import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { friendlyMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { type BankChangeRequest, useCreateBankChangeRequest, useOwnBankChangeRequests } from '@/features/vendor-portal/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

const schema = z.object({
  new_account_no: z.string().min(1, 'Required'),
  new_ifsc_code: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => IFSC_PATTERN.test(v), 'Invalid IFSC format, expected e.g. HDFC0001234'),
})
type FormValues = z.infer<typeof schema>

/** Phase 2B UI's vendor-bank-change.html: request form + history of past requests. */
export function VendorBankChangePage() {
  const { data: requests, isLoading } = useOwnBankChangeRequests()
  const createRequest = useCreateBankChangeRequest()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const columns = useMemo<ColumnDef<BankChangeRequest>[]>(
    () => [
      { header: 'Requested', accessorKey: 'created_at', cell: ({ row }) => formatDate(row.original.created_at) },
      {
        header: 'New Account / IFSC',
        id: 'account',
        cell: ({ row }) => `${row.original.new_account_no} / ${row.original.new_ifsc_code}`,
      },
      { header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ],
    [],
  )

  async function onSubmit(values: FormValues) {
    try {
      await createRequest.mutateAsync(values)
      reset()
    } catch (err) {
      setError('root', { message: friendlyMessage(err) })
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">Bank Change Request</h1>

      <Card>
        <CardContent className="pt-space-3">
          {errors.root && <p className="mb-space-2 text-size-4 text-destructive">{errors.root.message}</p>}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Label htmlFor="new_account_no">New Account Number</Label>
            <Input id="new_account_no" {...register('new_account_no')} />
            {errors.new_account_no && <p className="mt-1 text-size-5 text-destructive">{errors.new_account_no.message}</p>}

            <Label htmlFor="new_ifsc_code">New IFSC Code</Label>
            <Input id="new_ifsc_code" placeholder="HDFC0001234" maxLength={11} {...register('new_ifsc_code')} />
            {errors.new_ifsc_code && <p className="mt-1 text-size-5 text-destructive">{errors.new_ifsc_code.message}</p>}

            <Button type="submit" className="mt-space-3" disabled={isSubmitting}>
              Submit Request
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Request History</h2>
          <DataTable columns={columns} data={requests ?? []} isLoading={isLoading} emptyMessage="No bank change requests yet." />
        </CardContent>
      </Card>
    </div>
  )
}
