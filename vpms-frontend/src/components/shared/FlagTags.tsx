import { cn } from '@/lib/utils'

interface FlaggableInvoice {
  rate_variance_flag: boolean
  msme_alert_triggered: boolean
}

/** Direct port of the old static site's flagTagsHtml (static/js/api.js) — small
 * outlined tags shown next to an invoice's status badge for rate_variance_flag /
 * msme_alert_triggered. */
export function FlagTags({ invoice }: { invoice: FlaggableInvoice }) {
  if (!invoice.rate_variance_flag && !invoice.msme_alert_triggered) return null
  return (
    <span className="ml-1.5 inline-flex gap-1">
      {invoice.rate_variance_flag && (
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', 'border-warning text-warning')}>
          Rate variance
        </span>
      )}
      {invoice.msme_alert_triggered && (
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', 'border-primary text-primary')}>
          MSME
        </span>
      )}
    </span>
  )
}
