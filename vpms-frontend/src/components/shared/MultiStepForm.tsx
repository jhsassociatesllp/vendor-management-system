import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface MultiStepFormProps {
  steps: string[]
  /** 0-indexed. The parent owns which step's fields render as `children` — this
   * component only draws the indicator + back/next chrome around them. */
  currentStep: number
  children: ReactNode
  onBack?: () => void
  onNext?: () => void
  onSubmit?: () => void
  isNextDisabled?: boolean
  isSubmitting?: boolean
  nextLabel?: string
  submitLabel?: string
}

/** Section 6: a reusable stepper wrapper, replacing Phase 3's invoice submission form
 * and Phase 2B's OTP login's hand-rolled step-indicator/form-step/step-nav markup. */
export function MultiStepForm({
  steps,
  currentStep,
  children,
  onBack,
  onNext,
  onSubmit,
  isNextDisabled = false,
  isSubmitting = false,
  nextLabel = 'Next',
  submitLabel = 'Submit',
}: MultiStepFormProps) {
  const isLastStep = currentStep === steps.length - 1

  return (
    <div>
      <div className="mb-space-3 flex gap-space-1">
        {steps.map((label, i) => (
          <div
            key={label}
            className={cn(
              'flex-1 rounded-md border border-border bg-background px-1 py-2 text-center text-size-5 font-semibold text-muted-foreground',
              i === currentStep && 'border-primary bg-primary text-primary-foreground',
              i < currentStep && 'border-success bg-success-bg text-success',
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <div>{children}</div>

      <div className="mt-space-3 flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={currentStep === 0}>
          Back
        </Button>
        {isLastStep ? (
          <Button type="button" onClick={onSubmit} disabled={isNextDisabled || isSubmitting}>
            {isSubmitting ? 'Submitting…' : submitLabel}
          </Button>
        ) : (
          <Button type="button" onClick={onNext} disabled={isNextDisabled}>
            {nextLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
