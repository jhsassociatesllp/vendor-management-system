import { cn } from '@/lib/utils'

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Direct port of the old static site's buildBudgetBarHtml (static/js/api.js) — Phase 3
 * UI's budget utilization bar. Committed switches to warning past 85% of sanctioned,
 * danger past 100% (shouldn't happen given the backend's hard block, but rendered
 * defensively all the same). */
export function BudgetBar({ sanctioned, committed }: { sanctioned: number; committed: number }) {
  const available = sanctioned - committed
  const rawPercent = sanctioned > 0 ? (committed / sanctioned) * 100 : 0
  const displayPercent = Math.max(0, Math.min(100, rawPercent))

  let fillClass = 'bg-primary'
  if (rawPercent > 100) fillClass = 'bg-destructive'
  else if (rawPercent >= 85) fillClass = 'bg-warning'

  return (
    <div className="my-space-2">
      <div className="mb-1 flex items-baseline justify-between text-size-4">
        <span className="font-semibold text-foreground">{money(committed)} committed</span>
        <span className="text-muted-foreground">of {money(sanctioned)} sanctioned</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-border bg-background">
        <div
          className={cn('h-full rounded-full transition-all duration-300', fillClass)}
          style={{ width: `${displayPercent}%` }}
        />
      </div>
      <div className="mt-1 text-size-5 text-muted-foreground">{money(available)} available</div>
    </div>
  )
}
