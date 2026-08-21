import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

/** Section 6: "give this real thought, it's an easy place to feel unpolished if
 * skipped." Every list/table screen's "no results" case routes through this instead of
 * a bare line of text — a subtle icon, the message, and an optional action. */
export function EmptyState({
  message = 'Nothing here yet.',
  description,
  icon: Icon = Inbox,
  action,
}: {
  message?: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-space-4 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-size-3 font-medium text-foreground">{message}</p>
      {description && <p className="max-w-sm text-size-4 text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}
