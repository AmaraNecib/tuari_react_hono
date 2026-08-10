// TauriOS onboarding tour component
/**
 * UserJourney - Unified onboarding and help system
 * 
 * Replaces 8 separate modules with a single deep module.
 * Manages tours, tooltips, tutorials, and progress tracking
 * behind a small interface.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "@/lib/utils"

// ============ Types ============

interface TourStep {
  id: string
  target: string
  title: string
  content: string
  position?: "top" | "bottom" | "left" | "right"
}

interface JourneyConfig {
  /** Unique key for localStorage persistence */
  key: string
  /** Tour steps */
  steps?: TourStep[]
  /** Auto-start on first visit */
  autoStart?: boolean
}

interface JourneyState {
  /** Current status: not-started, active, completed, skipped */
  status: "not-started" | "active" | "completed" | "skipped"
  /** Current step index (for tours) */
  currentStep: number
  /** User's experience level (1-3) */
  level: 1 | 2 | 3
}

// ============ Internal State Manager ============

class JourneyStateManager {
  private key: string

  constructor(key: string) {
    this.key = key
  }

  private storageKey(type: string): string {
    return `journey-${this.key}-${type}`
  }

  getStatus(): JourneyState["status"] {
    const status = localStorage.getItem(this.storageKey("status"))
    return (status as JourneyState["status"]) || "not-started"
  }

  setStatus(status: JourneyState["status"]): void {
    localStorage.setItem(this.storageKey("status"), status)
  }

  getCurrentStep(): number {
    const step = localStorage.getItem(this.storageKey("step"))
    return parseInt(step || "0", 10)
  }

  setCurrentStep(step: number): void {
    localStorage.setItem(this.storageKey("step"), String(step))
  }

  getLevel(): 1 | 2 | 3 {
    const level = localStorage.getItem("user-onboarding-level")
    return Math.min(3, Math.max(1, Number(level) || 1)) as 1 | 2 | 3
  }

  setLevel(level: 1 | 2 | 3): void {
    localStorage.setItem("user-onboarding-level", String(level))
  }

  reset(): void {
    localStorage.removeItem(this.storageKey("status"))
    localStorage.removeItem(this.storageKey("step"))
  }
}

// ============ Main Module ============

export interface UserJourneyReturn {
  /** Current journey state */
  state: JourneyState
  /** Start the journey */
  start: () => void
  /** Complete the journey */
  complete: () => void
  /** Skip the journey */
  skip: () => void
  /** Reset the journey (for replay) */
  reset: () => void
  /** Advance to next step (for tours) */
  advance: () => void
  /** Go to previous step (for tours) */
  back: () => void
  /** Check if journey is active */
  isActive: boolean
  /** Check if journey is completed */
  isCompleted: boolean
}

/**
 * Hook for managing a user journey.
 * Provides a unified interface for tours, tutorials, and onboarding.
 */
export function useUserJourney(config: JourneyConfig): UserJourneyReturn {
  const managerRef = useRef<JourneyStateManager | null>(null)
  const configKeyRef = useRef(config.key)
  if (configKeyRef.current !== config.key) {
    configKeyRef.current = config.key
    managerRef.current = new JourneyStateManager(config.key)
  }
  if (managerRef.current === null) {
    managerRef.current = new JourneyStateManager(config.key)
  }
  const manager = managerRef.current

  const [state, setState] = useState<JourneyState>(() => ({
    status: manager.getStatus(),
    currentStep: manager.getCurrentStep(),
    level: manager.getLevel(),
  }))

  // Rehydrate state when config.key changes
  useEffect(() => {
    const m = managerRef.current!
    setState({
      status: m.getStatus(),
      currentStep: m.getCurrentStep(),
      level: m.getLevel(),
    })
  }, [config.key])

  // Auto-start on first visit
  useEffect(() => {
    if (config.autoStart && state.status === "not-started") {
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, status: "active" }))
        managerRef.current?.setStatus("active")
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [config.autoStart, state.status, config.key])

  const start = useCallback(() => {
    const m = managerRef.current!
    setState(prev => ({ ...prev, status: "active", currentStep: 0 }))
    m.setStatus("active")
    m.setCurrentStep(0)
  }, [])

  const complete = useCallback(() => {
    const m = managerRef.current!
    setState(prev => ({ ...prev, status: "completed" }))
    m.setStatus("completed")
    // Advance level on completion
    const currentLevel = m.getLevel()
    if (currentLevel < 3) {
      m.setLevel((currentLevel + 1) as 1 | 2 | 3)
      setState(prev => ({ ...prev, level: (currentLevel + 1) as 1 | 2 | 3 }))
    }
  }, [])

  const skip = useCallback(() => {
    const m = managerRef.current!
    setState(prev => ({ ...prev, status: "skipped" }))
    m.setStatus("skipped")
  }, [])

  const reset = useCallback(() => {
    const m = managerRef.current!
    m.reset()
    setState({ status: "not-started", currentStep: 0, level: m.getLevel() })
  }, [])

  const advance = useCallback(() => {
    const m = managerRef.current!
    const nextStep = state.currentStep + 1
    setState(prev => ({ ...prev, currentStep: nextStep }))
    m.setCurrentStep(nextStep)
  }, [state.currentStep])

  const back = useCallback(() => {
    const m = managerRef.current!
    const prevStep = Math.max(0, state.currentStep - 1)
    setState(prev => ({ ...prev, currentStep: prevStep }))
    m.setCurrentStep(prevStep)
  }, [state.currentStep])

  return {
    state,
    start,
    complete,
    skip,
    reset,
    advance,
    back,
    isActive: state.status === "active",
    isCompleted: state.status === "completed",
  }
}

// ============ React Components ============

interface UserJourneyTourProps {
  steps: TourStep[]
  storageKey: string
  children: ReactNode
  autoStart?: boolean
  className?: string
}

/**
 * Tour wrapper component using UserJourney.
 * Drop-in replacement for GuidedTourManager.
 *
 * The tour dialog is built on the Base UI Dialog primitive (issue #275):
 * it gets modal semantics (role="dialog", aria-modal, focus trap, scroll
 * lock) and ESC-to-skip for free. ESC behaves exactly like the Skip button
 * (the first-run tour is permanently marked skipped).
 */
export function UserJourneyTour({
  steps,
  storageKey,
  children,
  autoStart = false,
  className,
}: UserJourneyTourProps) {
  const journey = useUserJourney({ key: storageKey, steps, autoStart })
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Clamp currentStep to valid range to prevent bad persisted state
  const clampedStep = Math.max(0, Math.min(journey.state.currentStep, steps.length - 1))

  // If auto-start persisted an "active" status but no steps were provided,
  // there is no dialog to dismiss it — don't strand the journey (it would
  // rehydrate active on every reload). Skip it so the status stays sane.
  useEffect(() => {
    if (journey.isActive && steps.length === 0) {
      journey.skip()
    }
  }, [journey.isActive, steps.length, journey])

  if (journey.isActive && steps.length > 0) {
    const currentStep = steps[clampedStep]
    if (!currentStep) return <>{children}</>

    const isFirst = clampedStep === 0
    const isLast = clampedStep === steps.length - 1
    const stepNumber = clampedStep + 1
    const titleId = `journey-title-${storageKey}`

    return (
      <div className={cn("relative", className)}>
        {children}
        <DialogPrimitive.Root
          open={journey.isActive}
          onOpenChange={(open) => !open && journey.skip()}
          disablePointerDismissal
        >
          <DialogPrimitive.Portal>
            {/* Backdrop */}
            <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity" />
            {/* Dialog */}
            <DialogPrimitive.Popup
              ref={dialogRef}
              initialFocus={dialogRef}
              aria-modal="true"
              aria-labelledby={titleId}
              className="fixed z-50 top-1/2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 w-[min(24rem,90vw)] bg-surface border border-line rounded-2xl shadow-lg overflow-hidden outline-none"
            >
              {/* Progress bar */}
              <div className="flex gap-1 px-5 pt-5">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      i < stepNumber ? "bg-accent-brand" : "bg-line"
                    )}
                  />
                ))}
              </div>
              {/* Content */}
              <div className="px-5 pt-4 pb-2">
                <h3 id={titleId} className="text-base font-semibold text-ink mb-1">
                  {currentStep.title}
                </h3>
                <p className="text-sm text-ink-2 leading-relaxed">
                  {currentStep.content}
                </p>
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-4">
                <button
                  onClick={journey.skip}
                  className="text-sm text-ink-3 hover:text-ink transition-colors"
                >
                  {t("common.skip")}
                </button>
                <div className="flex gap-2">
                  {!isFirst && (
                    <button
                      onClick={journey.back}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-ink hover:bg-surface-2 transition-colors"
                    >
                      {t("common.previous")}
                    </button>
                  )}
                  {!isLast ? (
                    <button
                      onClick={journey.advance}
                      className="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent-brand text-white hover:opacity-90 transition-opacity"
                    >
                      {t("common.next")}
                    </button>
                  ) : (
                    <button
                      onClick={journey.complete}
                      className="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent-brand text-white hover:opacity-90 transition-opacity"
                    >
                      {t("common.done")}
                    </button>
                  )}
                </div>
              </div>
              {/* Step counter */}
              <div className="px-5 pb-4 text-xs text-ink-3">
                {t("common.stepOf", { current: stepNumber, total: steps.length })}
              </div>
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    )
  }

  return <div className={cn("relative", className)}>{children}</div>
}

export default useUserJourney
