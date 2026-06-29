/**
 * UserJourney - Unified onboarding and help system
 * 
 * Replaces 8 separate modules with a single deep module.
 * Manages tours, tooltips, tutorials, and progress tracking
 * behind a small interface.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react"
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
  const manager = new JourneyStateManager(config.key)

  const [state, setState] = useState<JourneyState>(() => ({
    status: manager.getStatus(),
    currentStep: manager.getCurrentStep(),
    level: manager.getLevel(),
  }))

  // Auto-start on first visit
  useEffect(() => {
    if (config.autoStart && state.status === "not-started") {
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, status: "active" }))
        manager.setStatus("active")
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [config.autoStart, state.status, config.key])

  const start = useCallback(() => {
    setState(prev => ({ ...prev, status: "active", currentStep: 0 }))
    manager.setStatus("active")
    manager.setCurrentStep(0)
  }, [config.key])

  const complete = useCallback(() => {
    setState(prev => ({ ...prev, status: "completed" }))
    manager.setStatus("completed")
    // Advance level on completion
    const currentLevel = manager.getLevel()
    if (currentLevel < 3) {
      manager.setLevel((currentLevel + 1) as 1 | 2 | 3)
      setState(prev => ({ ...prev, level: (currentLevel + 1) as 1 | 2 | 3 }))
    }
  }, [config.key])

  const skip = useCallback(() => {
    setState(prev => ({ ...prev, status: "skipped" }))
    manager.setStatus("skipped")
  }, [config.key])

  const reset = useCallback(() => {
    manager.reset()
    setState({ status: "not-started", currentStep: 0, level: manager.getLevel() })
  }, [config.key])

  const advance = useCallback(() => {
    const nextStep = state.currentStep + 1
    setState(prev => ({ ...prev, currentStep: nextStep }))
    manager.setCurrentStep(nextStep)
  }, [state.currentStep, config.key])

  const back = useCallback(() => {
    const prevStep = Math.max(0, state.currentStep - 1)
    setState(prev => ({ ...prev, currentStep: prevStep }))
    manager.setCurrentStep(prevStep)
  }, [state.currentStep, config.key])

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
 */
export function UserJourneyTour({
  steps,
  storageKey,
  children,
  autoStart = false,
  className,
}: UserJourneyTourProps) {
  const journey = useUserJourney({ key: storageKey, steps, autoStart })

  // Render tour overlay when active
  if (journey.isActive && steps.length > 0) {
    const currentStep = steps[journey.state.currentStep]
    if (currentStep) {
      return (
        <div className={cn("relative", className)}>
          {children}
          <div className="fixed inset-0 z-50 bg-black/50" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-lg p-6 max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-2">{currentStep.title}</h3>
            <p className="text-gray-600 mb-4">{currentStep.content}</p>
            <div className="flex justify-between">
              <button
                onClick={journey.skip}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Skip
              </button>
              <div className="flex gap-2">
                {journey.state.currentStep > 0 && (
                  <button
                    onClick={journey.back}
                    className="px-3 py-1 text-sm border rounded"
                  >
                    Back
                  </button>
                )}
                {journey.state.currentStep < steps.length - 1 ? (
                  <button
                    onClick={journey.advance}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={journey.complete}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded"
                  >
                    Finish
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-400">
              Step {journey.state.currentStep + 1} of {steps.length}
            </div>
          </div>
        </div>
      )
    }
  }

  return <div className={cn("relative", className)}>{children}</div>
}

export default useUserJourney
