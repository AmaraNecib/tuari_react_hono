import { useState, useEffect, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ProgressiveOnboardingProps {
  /** Unique key for this feature */
  featureKey: string
  /** Feature level (1 = basic, 2 = intermediate, 3 = advanced) */
  level: 1 | 2 | 3
  /** Children to wrap */
  children: ReactNode
  /** Additional className */
  className?: string
}

/**
 * Progressive onboarding wrapper.
 * Shows/hides features based on user's progress level.
 * Teaches complexity gradually.
 */
export function ProgressiveOnboarding({
  level,
  children,
  className,
}: ProgressiveOnboardingProps) {
  const [userLevel, setUserLevel] = useState<1 | 2 | 3>(1)

  useEffect(() => {
    const stored = localStorage.getItem("user-onboarding-level")
    if (stored) {
      setUserLevel(Math.min(3, Math.max(1, Number(stored))) as 1 | 2 | 3)
    }
  }, [])

  // Don't show features above user's level
  if (level > userLevel) {
    return null
  }

  return <div className={cn("progressive-onboarding", className)}>{children}</div>
}

interface OnboardingLevelProps {
  children: ReactNode
  className?: string
}

/**
 * Container for onboarding levels.
 * Shows different content based on user's progress.
 */
export function OnboardingLevel({
  children,
  className,
}: OnboardingLevelProps) {
  return <div className={cn("space-y-4", className)}>{children}</div>
}

interface OnboardingLevelItemProps {
  /** Feature level */
  level: 1 | 2 | 3
  /** Level label */
  label: string
  /** Level description */
  description: string
  /** Children to wrap */
  children: ReactNode
  /** Additional className */
  className?: string
}

/**
 * Individual level item with badge and description.
 */
export function OnboardingLevelItem({
  level,
  label,
  description,
  children,
  className,
}: OnboardingLevelItemProps) {
  const levelConfig = {
    1: { badge: "أساسي", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    2: { badge: "متوسط", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    3: { badge: "متقدم", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  }

  const config = levelConfig[level]

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            config.color,
          )}
        >
          {config.badge}
        </span>
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  )
}

interface OnboardingProgressProps {
  /** Current level (1-3) */
  currentLevel: 1 | 2 | 3
  /** Callback to update level */
  onLevelChange?: (level: 1 | 2 | 3) => void
  /** Additional className */
  className?: string
}

/**
 * Progress indicator showing onboarding levels.
 * Allows users to see their progress and advance.
 */
export function OnboardingProgress({
  currentLevel,
  onLevelChange,
  className,
}: OnboardingProgressProps) {
  const levels = [
    { level: 1 as const, label: "أساسي", description: "الميزات الأساسية" },
    { level: 2 as const, label: "متوسط", description: "الميزات الإضافية" },
    { level: 3 as const, label: "متقدم", description: "كل الميزات" },
  ]

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-medium text-foreground">مستوى التقدم</h4>
      <div className="space-y-2">
        {levels.map((l) => {
          const isActive = currentLevel >= l.level
          const isCurrent = currentLevel === l.level

          return (
            <button
              key={l.level}
              type="button"
              className={cn(
                "w-full rounded-lg border p-3 text-start transition-colors",
                isCurrent
                  ? "border-primary/50 bg-primary/5"
                  : isActive
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                    : "border-line bg-muted/30",
              )}
              onClick={() => onLevelChange?.(l.level)}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium",
                    isActive
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {l.level}
                </div>
                <span
                  className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {l.label}
                </span>
              </div>
              <p className="mt-1 ms-7 text-xs text-muted-foreground">
                {l.description}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Hook to manage onboarding level.
 */
export function useOnboardingLevel() {
  const [level, setLevel] = useState<1 | 2 | 3>(() => {
    if (typeof window === "undefined") return 1
    const stored = localStorage.getItem("user-onboarding-level")
    return stored ? (Math.min(3, Math.max(1, Number(stored))) as 1 | 2 | 3) : 1
  })

  const updateLevel = (newLevel: 1 | 2 | 3) => {
    setLevel(newLevel)
    localStorage.setItem("user-onboarding-level", String(newLevel))
  }

  const incrementLevel = () => {
    const newLevel = Math.min(3, level + 1) as 1 | 2 | 3
    updateLevel(newLevel)
  }

  const resetLevel = () => {
    updateLevel(1)
    localStorage.removeItem("user-onboarding-level")
  }

  return {
    level,
    updateLevel,
    incrementLevel,
    resetLevel,
  }
}
