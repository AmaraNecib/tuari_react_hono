import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface TourStep {
  /** Unique identifier for the step */
  id: string
  /** Target element selector (CSS selector) */
  target: string
  /** Step title */
  title: string
  /** Step description */
  content: string
  /** Position relative to target */
  position?: "top" | "bottom" | "left" | "right"
}

interface GuidedTourProps {
  /** Tour steps */
  steps: TourStep[]
  /** Unique key for localStorage persistence */
  storageKey: string
  /** Whether the tour is currently active */
  isActive: boolean
  /** Callback when tour completes */
  onComplete: () => void
  /** Callback when tour is skipped */
  onSkip: () => void
  /** Callback to restart tour */
  onRestart?: () => void
}

/** Detect if the document direction is RTL. */
function isRtl(): boolean {
  return document.documentElement.dir === "rtl" || document.documentElement.getAttribute("dir") === "rtl"
}

/**
 * Guided tour component with spotlight and step-by-step walkthrough.
 * Persists completion status and allows replay.
 */
export function GuidedTour({
  steps,
  storageKey,
  isActive,
  onComplete,
  onSkip,
  onRestart,
}: GuidedTourProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  // Reset step when tour re-activates
  useEffect(() => {
    if (isActive) {
      setCurrentStep(0)
    }
  }, [isActive])

  // Get target element position with retry and ongoing observation
  useEffect(() => {
    if (!isActive) return

    const step = steps[currentStep]
    if (!step) return

    let retryCount = 0
    const maxRetries = 10
    let frameId: number | null = null

    const updatePosition = () => {
      const element = document.querySelector(step.target)
      if (element) {
        const rect = element.getBoundingClientRect()
        setTargetRect(rect)
        retryCount = 0
      } else if (retryCount < maxRetries) {
        retryCount++
        setTimeout(updatePosition, 150)
      } else {
        setTargetRect(null)
      }
    }

    // Use ResizeObserver for more reliable position tracking
    let observer: ResizeObserver | null = null
    const element = document.querySelector(step.target)
    if (element && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        const rect = element.getBoundingClientRect()
        setTargetRect(rect)
      })
      observer.observe(element)
    }

    updatePosition()

    const onResize = () => {
      if (frameId) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(updatePosition)
    }

    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      observer?.disconnect()
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [isActive, currentStep, steps])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      localStorage.setItem(`tour-${storageKey}`, "completed")
      onComplete()
    }
  }, [currentStep, steps.length, storageKey, onComplete])

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }, [currentStep])

  const handleSkip = useCallback(() => {
    localStorage.setItem(`tour-${storageKey}`, "skipped")
    onSkip()
  }, [storageKey, onSkip])

  const handleRestart = useCallback(() => {
    setCurrentStep(0)
    onRestart?.()
  }, [onRestart])

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        handleSkip()
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault()
        handleNext()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrevious()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isActive, handleNext, handlePrevious, handleSkip])

  // Compute tooltip position — swap left/right in RTL, clamp to viewport
  const tooltipStyle = useMemo(() => {
    if (!targetRect) return undefined

    const rtl = isRtl()
    const pos = steps[currentStep]?.position ?? "bottom"
    // In RTL, swap left↔right so the tooltip stays near the target
    const effectivePos = rtl
      ? pos === "left" ? "right"
        : pos === "right" ? "left"
        : pos
      : pos

    const gap = 12
    const TOOLTIP_W = 288 // w-72 = 18rem
    const TOOLTIP_H = 200 // approximate height
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = targetRect

    function calcPos(direction: string) {
      const t =
        direction === "bottom"
          ? rect.bottom + gap
          : direction === "top"
            ? rect.top - gap
            : rect.top + rect.height / 2

      const l =
        direction === "right"
          ? rect.right + gap
          : direction === "left"
            ? rect.left - gap
            : rect.left + rect.width / 2

      const tr =
        direction === "bottom" || direction === "top"
          ? "translateX(-50%)"
          : direction === "left" || direction === "right"
            ? "translateY(-50%)"
            : "none"

      return { t, l, tr }
    }

    // Calculate the ideal position
    let { t: top, l: left, tr: transform } = calcPos(effectivePos)

    // For left/right tooltips, check if it overflows horizontally; if so, flip
    if (effectivePos === "left" || effectivePos === "right") {
      if (left < 0 || left + TOOLTIP_W > vw) {
        const flip = effectivePos === "left" ? "right" : "left"
        const flipped = calcPos(flip)
        // Use flipped only if it fits better
        if (flipped.l >= 0 && flipped.l + TOOLTIP_W <= vw) {
          left = flipped.l
          transform = flipped.tr
        } else {
          // Clamp to viewport
          left = Math.max(gap, Math.min(left, vw - TOOLTIP_W - gap))
        }
      }
      // Vertical clamp for centered tooltips
      if (top - TOOLTIP_H / 2 < 0) top = TOOLTIP_H / 2 + gap
      if (top + TOOLTIP_H / 2 > vh) top = vh - TOOLTIP_H / 2 - gap
    }

    // For top/bottom tooltips, clamp horizontal center
    if (effectivePos === "top" || effectivePos === "bottom") {
      if (left - TOOLTIP_W / 2 < 0) left = TOOLTIP_W / 2 + gap
      if (left + TOOLTIP_W / 2 > vw) left = vw - TOOLTIP_W / 2 - gap
    }

    return { top, left, transform } as const
  }, [targetRect, currentStep, steps])

  if (!isActive) return null

  const step = steps[currentStep]
  if (!step) return null

  const showCentered = !targetRect || !tooltipStyle

  return (
    <>
      {/* Backdrop — lowest z-layer */}
      <div
        className="fixed inset-0 z-[100] bg-black/30"
        onClick={handleSkip}
        aria-hidden="true"
      />

      {/* Spotlight — middle z-layer, clicks pass through */}
      {targetRect ? (
        <div
          className="fixed z-[101] rounded-lg ring-4 ring-primary/50 pointer-events-none"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      ) : null}

      {/* Tooltip — highest z-layer */}
      <div
        role="dialog"
        aria-label={t("tour.step", { current: currentStep + 1, total: steps.length })}
        className={cn(
          "fixed z-[102] w-72 rounded-xl border border-line bg-card p-4 shadow-lg",
          showCentered && "top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
        onClick={(e) => e.stopPropagation()}
        style={
          !showCentered && tooltipStyle
            ? {
                top: tooltipStyle.top,
                left: tooltipStyle.left,
                transform: tooltipStyle.transform,
              }
            : undefined
        }
      >
        {/* Step counter */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("tour.step", { current: currentStep + 1, total: steps.length })}
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-surface-2"
            onClick={handleSkip}
            aria-label={t("tour.skip")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{step.content}</p>
        </div>

        {/* Progress dots */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === currentStep ? "w-5 bg-primary" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2">
            {currentStep > 0 ? (
              <Button size="sm" variant="outline" onClick={handlePrevious}>
                <ChevronRight size={14} className="ms-1" />
                {t("tour.previous")}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleSkip}>
              {t("tour.skip")}
            </Button>
            <Button size="sm" onClick={handleNext}>
              {currentStep === steps.length - 1 ? t("tour.finish") : t("tour.next")}
              {currentStep < steps.length - 1 && (
                <ChevronLeft size={14} className="me-1" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

interface GuidedTourTriggerProps {
  /** Tour steps */
  steps: TourStep[]
  /** Unique key for localStorage persistence */
  storageKey: string
  /** Label for the trigger button */
  label?: string
  /** Additional className */
  className?: string
}

/**
 * Trigger button to start/restart a guided tour.
 * Shows "Start Tour" or "Restart Tour" based on completion status.
 */
export function GuidedTourTrigger({
  steps,
  storageKey,
  label,
  className,
}: GuidedTourTriggerProps) {
  const { t } = useTranslation()
  const [isActive, setIsActive] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  useEffect(() => {
    const status = localStorage.getItem(`tour-${storageKey}`)
    setIsCompleted(status === "completed" || status === "skipped")
  }, [storageKey])

  const handleComplete = () => {
    setIsActive(false)
    setIsCompleted(true)
  }

  const handleSkip = () => {
    setIsActive(false)
    setIsCompleted(true)
  }

  const handleRestart = () => {
    localStorage.removeItem(`tour-${storageKey}`)
    setIsCompleted(false)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("gap-2", className)}
        onClick={() => {
          handleRestart()
          setIsActive(true)
        }}
      >
        {isCompleted ? <RotateCcw size={14} /> : null}
        {label ?? (isCompleted ? t("tour.restart") : t("tour.start"))}
      </Button>

      <GuidedTour
        steps={steps}
        storageKey={storageKey}
        isActive={isActive}
        onComplete={handleComplete}
        onSkip={handleSkip}
        onRestart={handleRestart}
      />
    </>
  )
}

interface GuidedTourManagerProps {
  /** Tour steps */
  steps: TourStep[]
  /** Unique key for localStorage persistence */
  storageKey: string
  /** Children to wrap */
  children: ReactNode
  /** Auto-start tour on first visit */
  autoStart?: boolean
  /** Additional className */
  className?: string
}

/**
 * Manager component that wraps content and provides tour functionality.
 * Auto-starts tour on first visit if autoStart is true.
 */
export function GuidedTourManager({
  steps,
  storageKey,
  children,
  autoStart = false,
  className,
}: GuidedTourManagerProps) {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (autoStart) {
      const status = localStorage.getItem(`tour-${storageKey}`)
      if (!status) {
        // Delay tour start to let DOM render
        const timer = setTimeout(() => {
          setIsActive(true)
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [autoStart, storageKey])

  const handleComplete = () => {
    setIsActive(false)
    localStorage.setItem(`tour-${storageKey}`, "completed")
  }

  const handleSkip = () => {
    setIsActive(false)
    localStorage.setItem(`tour-${storageKey}`, "skipped")
  }

  const handleRestart = () => {
    localStorage.removeItem(`tour-${storageKey}`)
  }

  return (
    <div className={cn("relative", className)}>
      {children}
      <GuidedTour
        steps={steps}
        storageKey={storageKey}
        isActive={isActive}
        onComplete={handleComplete}
        onSkip={handleSkip}
        onRestart={handleRestart}
      />
    </div>
  )
}
