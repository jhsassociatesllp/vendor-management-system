import { cn } from '@/lib/utils'

/** Direct port of the old static site's buildUrgencyChipHtml (static/js/api.js) —
 * `dueDateIso` compared against today; `thresholdDays` is 3 for TAT due dates, 7 for
 * MSME payment due dates. */
export function UrgencyChip({ dueDateIso, thresholdDays }: { dueDateIso: string | null | undefined; thresholdDays: number }) {
  if (!dueDateIso) return null

  const due = new Date(dueDateIso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const daysLeft = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let variant: 'ok' | 'warning' | 'danger'
  let label: string
  if (daysLeft < 0) {
    variant = 'danger'
    label = `Overdue by ${Math.abs(daysLeft)}d`
  } else if (daysLeft <= thresholdDays) {
    variant = 'warning'
    label = daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`
  } else {
    variant = 'ok'
    label = `Due in ${daysLeft}d`
  }

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-size-5 font-semibold',
        variant === 'ok' && 'bg-success-bg text-success',
        variant === 'warning' && 'bg-warning-bg text-warning',
        variant === 'danger' && 'bg-destructive-bg text-destructive',
      )}
    >
      {label}
    </span>
  )
}
