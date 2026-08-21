import { cn } from '@/lib/utils'

export interface ApprovalStage {
  level: 'L1' | 'L2' | 'L3' | 'L4'
  status: 'Pending' | 'Completed' | 'Rejected' | 'Skipped' | 'Query_Raised' | 'Returned'
}

type StepState = 'complete' | 'current' | 'pending' | 'skipped' | 'query' | 'returned' | 'rejected' | 'na'

const LEVEL_TO_INVOICE_STATUS: Record<string, string> = {
  L1: 'L1_Verification',
  L2: 'L2_Review',
  L3: 'L3_Approval',
  L4: 'L4_Finance_Approval',
}

const DOT_CLASSES: Record<StepState, string> = {
  complete: 'bg-success border-success',
  current: 'bg-primary border-primary ring-4 ring-primary/20',
  pending: 'bg-surface border-primary',
  skipped: 'bg-background border-border',
  query: 'bg-warning border-warning',
  returned: 'bg-surface border-warning',
  rejected: 'bg-destructive border-destructive',
  na: 'bg-background border-border opacity-50',
}

const LABEL_CLASSES: Record<StepState, string> = {
  complete: 'text-success',
  current: 'text-primary',
  pending: 'text-primary',
  skipped: 'text-muted-foreground line-through font-normal',
  query: 'text-warning',
  returned: 'text-warning',
  rejected: 'text-destructive',
  na: 'text-muted-foreground opacity-50',
}

function Step({ label, state, sublabel }: { label: string; state: StepState; sublabel?: string }) {
  return (
    <div className="flex min-w-[84px] shrink-0 flex-col items-center">
      <div className={cn('h-[22px] w-[22px] rounded-full border-[3px] box-border', DOT_CLASSES[state])} />
      <div className={cn('mt-1.5 text-center text-size-5 font-semibold', LABEL_CLASSES[state])}>{label}</div>
      {sublabel && <div className="text-center text-[10px] text-muted-foreground">{sublabel}</div>}
    </div>
  )
}

function Connector() {
  return <div className="mt-2.5 h-[3px] min-w-[20px] flex-1 bg-border" />
}

/** Direct port of the old static site's buildWorkflowTimelineHtml (static/js/api.js) —
 * Phase 4 UI's L1→L2→L3→L4→Payment timeline, including its skipped/query/rejected
 * states. `stages` is one row per L1-L4 (already deduped to the latest routing cycle by
 * the API, same as before); `invoiceStatus` is the invoice's own status field. */
export function WorkflowTimeline({
  stages,
  invoiceStatus,
}: {
  stages: ApprovalStage[]
  invoiceStatus: string
}) {
  const byLevel = Object.fromEntries(stages.map((s) => [s.level, s]))
  const levels: ApprovalStage['level'][] = ['L1', 'L2', 'L3', 'L4']
  const steps: { label: string; state: StepState; sublabel?: string }[] = []
  let terminal = false

  for (const level of levels) {
    const stage = byLevel[level]
    if (!stage || terminal) {
      steps.push({ label: level, state: 'na' })
      continue
    }

    switch (stage.status) {
      case 'Skipped':
        steps.push({ label: level, state: 'skipped', sublabel: 'Skipped' })
        break
      case 'Completed':
        steps.push({ label: level, state: 'complete' })
        break
      case 'Rejected':
        steps.push({ label: level, state: 'rejected', sublabel: 'Rejected' })
        terminal = true
        break
      case 'Query_Raised':
        steps.push({ label: level, state: 'query', sublabel: 'Query raised' })
        break
      case 'Returned':
        steps.push({ label: level, state: 'returned', sublabel: 'Returned' })
        break
      default: // Pending
        steps.push({
          label: level,
          state: invoiceStatus === LEVEL_TO_INVOICE_STATUS[level] ? 'current' : 'pending',
        })
    }
  }

  let paymentState: StepState = 'na'
  let paymentSublabel: string | undefined
  if (!terminal) {
    if (invoiceStatus === 'Paid') {
      paymentState = 'complete'
    } else if (invoiceStatus === 'Approved_For_Payment') {
      paymentState = 'current'
    } else if (invoiceStatus === 'On_Hold') {
      paymentState = 'query'
      paymentSublabel = 'On hold'
    } else if (invoiceStatus === 'Returned_To_Vendor' || invoiceStatus === 'Query_Raised') {
      paymentState = 'na'
    } else {
      paymentState = 'pending'
    }
  }
  steps.push({ label: 'Payment', state: paymentState, sublabel: paymentSublabel })

  return (
    <div className="my-space-2 flex items-start overflow-x-auto">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-start">
          <Step {...step} />
          {i < steps.length - 1 && <Connector />}
        </div>
      ))}
    </div>
  )
}
