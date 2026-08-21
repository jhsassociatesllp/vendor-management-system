import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { type ItemCode, useCreateItemCode, useItemCodes } from '@/features/vendor/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  category: z.string().min(1, 'Required'),
  sub_category: z.string().min(1, 'Required'),
  description: z.string().min(1, 'Required'),
  unit: z.string().min(1, 'Required'),
  default_rate: z.coerce.number().min(0, 'Must be 0 or more'),
})
type FormValues = z.infer<typeof schema>

export function ItemCodesPage() {
  const { user } = useAuth()
  const { data: itemCodes, isLoading } = useItemCodes()
  const createItemCode = useCreateItemCode()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const columns = useMemo<ColumnDef<ItemCode>[]>(
    () => [
      { header: 'Category', accessorKey: 'category' },
      { header: 'Sub-category', accessorKey: 'sub_category' },
      { header: 'Description', accessorKey: 'description' },
      { header: 'Unit', accessorKey: 'unit' },
      { header: 'Default Rate', accessorKey: 'default_rate' },
      { header: 'Active', accessorKey: 'is_active', cell: ({ row }) => (row.original.is_active ? 'Yes' : 'No') },
    ],
    [],
  )

  if (!user || !['Accounts Executive', 'System Admin'].includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  async function onSubmit(values: FormValues) {
    try {
      await createItemCode.mutateAsync({ ...values, default_rate: String(values.default_rate) })
      reset()
    } catch (err) {
      setError('root', { message: friendlyMessage(err) })
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">Item Codes</h1>

      <Card>
        <CardContent className="pt-space-3">
          <DataTable columns={columns} data={itemCodes ?? []} isLoading={isLoading} emptyMessage="No item codes yet." />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Add Item Code</h2>
          {errors.root && <p className="mb-space-2 text-size-4 text-destructive">{errors.root.message}</p>}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Label htmlFor="category">Category</Label>
            <Input id="category" {...register('category')} />
            {errors.category && <p className="mt-1 text-size-5 text-destructive">{errors.category.message}</p>}

            <Label htmlFor="sub_category">Sub-category</Label>
            <Input id="sub_category" {...register('sub_category')} />
            {errors.sub_category && <p className="mt-1 text-size-5 text-destructive">{errors.sub_category.message}</p>}

            <Label htmlFor="description">Description</Label>
            <Input id="description" {...register('description')} />
            {errors.description && <p className="mt-1 text-size-5 text-destructive">{errors.description.message}</p>}

            <Label htmlFor="unit">Unit</Label>
            <Input id="unit" {...register('unit')} />
            {errors.unit && <p className="mt-1 text-size-5 text-destructive">{errors.unit.message}</p>}

            <Label htmlFor="default_rate">Default Rate</Label>
            <Input id="default_rate" type="number" step="0.01" min={0} {...register('default_rate')} />
            {errors.default_rate && <p className="mt-1 text-size-5 text-destructive">{errors.default_rate.message}</p>}

            <Button type="submit" className="mt-space-3" disabled={isSubmitting}>
              Add Item Code
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
