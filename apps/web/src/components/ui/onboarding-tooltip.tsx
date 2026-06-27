import { useState, useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface OnboardingTooltipProps {
  /** Unique key for localStorage persistence */
  storageKey: string
  /** Tooltip content */
  children: ReactNode
  /** Target element to highlight */
  target: ReactNode
  /** Position relative to target */
  position?: "top" | "bottom" | "left" | "right"
  /** Show only once (default: true) */
  showOnce?: boolean
  /** Additional className */
  className?: string
}

/**
 * Onboarding tooltip that shows once and persists dismissal.
 * Used for feature discovery and contextual help.
 */
export function OnboardingTooltip({
  storageKey,
  children,
  target,
  position = "bottom",
  showOnce = true,
  className,
}: OnboardingTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (showOnce) {
      const hasSeen = localStorage.getItem(`tooltip-${storageKey}`)
      if (!hasSeen) {
        setIsVisible(true)
      }
    } else {
      setIsVisible(true)
    }
  }, [storageKey, showOnce])

  const handleDismiss = () => {
    setIsVisible(false)
    if (showOnce) {
      localStorage.setItem(`tooltip-${storageKey}`, "true")
    }
  }

  if (!isVisible) {
    return <>{target}</>
  }

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }

  return (
    <div className={cn("relative inline-block", className)}>
      {target}
      <div
        className={cn(
          "absolute z-50 w-64 rounded-xl border border-line bg-card p-4 shadow-lg",
          positionClasses[position],
        )}
      >
        <button
          type="button"
          className="absolute top-2 end-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
        <div className="space-y-2">
          {children}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleDismiss}
          >
            لا تظهر مرة أخرى
          </button>
          <Button size="sm" onClick={handleDismiss}>
            حسناً
          </Button>
        </div>
      </div>
    </div>
  )
}

interface FeatureHighlightProps {
  /** Unique key for localStorage persistence */
  storageKey: string
  /** Highlight content */
  children: ReactNode
  /** Target element to highlight */
  target: ReactNode
  /** Show only once (default: true) */
  showOnce?: boolean
  /** Additional className */
  className?: string
}

/**
 * Simple feature highlight with badge indicator.
 * Shows a small badge on first visit, persists dismissal.
 */
export function FeatureHighlight({
  storageKey,
  children,
  target,
  showOnce = true,
  className,
}: FeatureHighlightProps) {
  const [isHighlighted, setIsHighlighted] = useState(false)

  useEffect(() => {
    if (showOnce) {
      const hasSeen = localStorage.getItem(`highlight-${storageKey}`)
      if (!hasSeen) {
        setIsHighlighted(true)
      }
    } else {
      setIsHighlighted(true)
    }
  }, [storageKey, showOnce])

  const handleDismiss = () => {
    setIsHighlighted(false)
    if (showOnce) {
      localStorage.setItem(`highlight-${storageKey}`, "true")
    }
  }

  return (
    <div className={cn("relative inline-block", className)}>
      {target}
      {isHighlighted ? (
        <div className="absolute -top-1 -end-1">
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            onClick={handleDismiss}
          >
            {children}
          </button>
        </div>
      ) : null}
    </div>
  )
}
