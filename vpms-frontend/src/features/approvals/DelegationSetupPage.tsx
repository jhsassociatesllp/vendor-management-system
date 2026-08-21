import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { type Delegation, useAllUsers, useCreateDelegation, useDelegations } from '@/features/approvals/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const APPROVER_ROLES = ['Accounts Executive', 'Dept. Manager', 'Partner / VP', 'Finance Team', 'System Admin']

const schema = z
  .object({
    delegate_user_id: z.string().min(1, 'Select a user'),
    valid_from: z.string().min(1, 'Required'),
    valid_to: z.string().min(1, 'Required'),
  })
  .refine((data) => data.valid_to >= data.valid_from, { message: 'valid_to must be on or after valid_from', path: ['valid_to'] })
type FormValues = z.infer<typeof schema>

function delegationStatus(d: Delegation): { variant: 'neutral' | 'warning' | 'success'; label: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (d.valid_to < today) return { variant: 'neutral', label: 'Expired' }
  if (d.valid_from > today) return { variant: 'warning', label: 'Upcoming' }
  return { variant: 'success', label: 'Active' }
}

export function DelegationSetupPage() {
  const { user } = useAuth()
  const { data: delegations, isLoading } = useDelegations()
  const { data: users } = useAllUsers()
  const createDelegation = useCreateDelegation()

  const userNameById = new Map((users ?? []).map((u) => [u.id, `${u.name} (${u.role})`]))

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const columns = useMemo<ColumnDef<Delegation>[]>(
    () => [
      {
        header: 'Direction',
        id: 'direction',
        accessorFn: (d) => (d.delegator_user_id === user?.id ? 'To' : 'From'),
      },
      {
        // accessorFn (for sort) + cell (for display) — cell re-runs the lookup fresh every
        // render, since accessorFn's cached getValue() can go stale if the users list
        // resolves after the first render and leave the raw ID showing forever.
        header: 'User',
        id: 'otherUser',
        accessorFn: (d) => {
          const otherId = d.delegator_user_id === user?.id ? d.delegate_user_id : d.delegator_user_id
          return userNameById.get(otherId) ?? otherId
        },
        cell: ({ row }) => {
          const d = row.original
          const otherId = d.delegator_user_id === user?.id ? d.delegate_user_id : d.delegator_user_id
          return userNameById.get(otherId) ?? otherId
        },
      },
      { header: 'Valid From', accessorKey: 'valid_from' },
      { header: 'Valid To', accessorKey: 'valid_to' },
      {
        header: 'Status',
        id: 'status',
        cell: ({ row }) => {
          const { variant, label } = delegationStatus(row.original)
          return <Badge variant={variant}>{label}</Badge>
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, user],
  )

  if (!user || !APPROVER_ROLES.includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  async function onSubmit(values: FormValues) {
    try {
      await createDelegation.mutateAsync(values)
      reset()
    } catch (err) {
      setError('root', { message: friendlyMessage(err) })
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">Delegations</h1>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Create Delegation</h2>
          {errors.root && <p className="mb-space-2 text-size-4 text-destructive">{errors.root.message}</p>}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Label htmlFor="delegate_user_id">Delegate To</Label>
            <Controller
              name="delegate_user_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="delegate_user_id">
                    <SelectValue placeholder="Select a user…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(users ?? [])
                      .filter((u) => u.id !== user.id)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} — {u.role}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.delegate_user_id && <p className="mt-1 text-size-5 text-destructive">{errors.delegate_user_id.message}</p>}

            <Label htmlFor="valid_from">Valid From</Label>
            <Input id="valid_from" type="date" {...register('valid_from')} />
            {errors.valid_from && <p className="mt-1 text-size-5 text-destructive">{errors.valid_from.message}</p>}

            <Label htmlFor="valid_to">Valid To</Label>
            <Input id="valid_to" type="date" {...register('valid_to')} />
            {errors.valid_to && <p className="mt-1 text-size-5 text-destructive">{errors.valid_to.message}</p>}

            <Button type="submit" className="mt-space-3" disabled={isSubmitting}>
              Create Delegation
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <DataTable columns={columns} data={delegations ?? []} isLoading={isLoading} emptyMessage="No delegations yet." />
        </CardContent>
      </Card>
    </div>
  )
}
