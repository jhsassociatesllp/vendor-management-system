import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Controller } from 'react-hook-form'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { type BudgetHead, useBudgetAvailability, useBudgetHeads, useCreateBudgetHead } from '@/features/procurement/hooks'
import { BudgetBar } from '@/components/shared/BudgetBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CREATOR_ROLES = ['Budget Controller', 'System Admin']
const PERIOD_TYPES = ['Monthly', 'Quarterly', 'Annual']

const schema = z.object({
  department: z.string().min(1, 'Required'),
  cost_centre: z.string().min(1, 'Required'),
  period_type: z.string().min(1, 'Required'),
  period_label: z.string().min(1, 'Required'),
  sanctioned_amount: z.coerce.number({ invalid_type_error: 'Enter a number' }).gt(0, 'Must be greater than 0'),
})
type FormValues = z.infer<typeof schema>

function BudgetHeadCard({ head }: { head: BudgetHead }) {
  const { data: availability } = useBudgetAvailability(head.id)
  return (
    <Card>
      <CardContent className="pt-space-3">
        <h3 className="font-heading text-size-3 font-bold">
          {head.department} — {head.cost_centre}
        </h3>
        <p className="mb-space-2 text-size-5 text-muted-foreground">
          {head.period_type} · {head.period_label}
        </p>
        {availability ? (
          <BudgetBar sanctioned={Number(availability.sanctioned_amount)} committed={Number(availability.committed_amount)} />
        ) : (
          <p className="text-size-4 text-muted-foreground">Loading…</p>
        )}
      </CardContent>
    </Card>
  )
}

export function BudgetHeadsPage() {
  const { user } = useAuth()
  const { data: heads, isLoading } = useBudgetHeads()
  const createHead = useCreateBudgetHead()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { period_type: 'Annual' } })

  const canCreate = user && CREATOR_ROLES.includes(user.role)

  async function onSubmit(values: FormValues) {
    try {
      await createHead.mutateAsync({ ...values, sanctioned_amount: String(values.sanctioned_amount) })
      reset({ department: '', cost_centre: '', period_type: 'Annual', period_label: '', sanctioned_amount: undefined })
    } catch (err) {
      setError('root', { message: friendlyMessage(err) })
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">Budget Heads</h1>

      {canCreate && (
        <Card>
          <CardContent className="pt-space-3">
            <h2 className="mb-space-2 font-heading text-size-2 font-bold">Create Budget Head</h2>
            {errors.root && <p className="mb-space-2 text-size-4 text-destructive">{errors.root.message}</p>}
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <Label htmlFor="department">Department</Label>
              <Input id="department" {...register('department')} />
              {errors.department && <p className="mt-1 text-size-5 text-destructive">{errors.department.message}</p>}

              <Label htmlFor="cost_centre">Cost Centre</Label>
              <Input id="cost_centre" {...register('cost_centre')} />
              {errors.cost_centre && <p className="mt-1 text-size-5 text-destructive">{errors.cost_centre.message}</p>}

              <Label htmlFor="period_type">Period Type</Label>
              <Controller
                name="period_type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="period_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIOD_TYPES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <Label htmlFor="period_label">Period Label</Label>
              <Input id="period_label" placeholder="e.g. FY2026-Q1" {...register('period_label')} />
              {errors.period_label && <p className="mt-1 text-size-5 text-destructive">{errors.period_label.message}</p>}

              <Label htmlFor="sanctioned_amount">Sanctioned Amount (INR)</Label>
              <Input id="sanctioned_amount" type="number" min={0.01} step="0.01" {...register('sanctioned_amount')} />
              {errors.sanctioned_amount && (
                <p className="mt-1 text-size-5 text-destructive">{errors.sanctioned_amount.message}</p>
              )}

              <Button type="submit" className="mt-space-3" disabled={isSubmitting}>
                Create Budget Head
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !heads || heads.length === 0 ? (
        <EmptyState message="No budget heads yet." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-space-2">
          {heads.map((head) => (
            <BudgetHeadCard key={head.id} head={head} />
          ))}
        </div>
      )}
    </div>
  )
}
