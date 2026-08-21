import type { ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Section 6: the "you already approved this" / "you can't confirm your own payment"
 * disabled-button-with-explanation pattern used repeatedly in Phase 2B/4. Wrap a
 * (visually) disabled trigger and it explains why on hover — a plain disabled button
 * gives no such explanation, which is exactly the old static site's gap this closes. */
export function DisabledActionTooltip({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tooltip>
      {/* span wrapper: a disabled button doesn't fire pointer events, so Radix's
         trigger needs a hoverable element around it to detect the hover at all. */}
      <TooltipTrigger asChild>
        <span className="inline-block cursor-not-allowed">{children}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}
