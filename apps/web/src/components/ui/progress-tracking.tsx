import { useState, useEffect, useCallback } from "react"
import { Check, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

interface OnboardingTask {
  /** Unique identifier */
  id: string
  /** Task title */
  title: string
  /** Task description */
  description: string
  /** Task category */
  category: "setup" | "features" | "advanced"
  /** localStorage key to check completion */
  storageKey: string
  /** Optional link to task */
  link?: string
}

interface ProgressTrackingProps {
  /** Tasks to track */
  tasks: OnboardingTask[]
  /** Additional className */
  className?: string
}

/**
 * Progress tracking component showing onboarding completion.
 * Persists progress in localStorage.
 */
/**
 * @description Component
 */
export function ProgressTracking({ tasks, className }: ProgressTrackingProps) {
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())

  useEffect(() => {
    const completed = new Set<string>()
    tasks.forEach((task) => {
      const status = localStorage.getItem(`task-${task.storageKey}`)
      if (status === "completed") {
        completed.add(task.id)
      }
    })
    setCompletedTasks(completed)
  }, [tasks])

  const progress = tasks.length === 0 ? 0 : (completedTasks.size / tasks.length) * 100

  const categories = {
    setup: { label: "الإعداد الأساسي", color: "text-blue-600 dark:text-blue-400" },
    features: { label: "الميزات الأساسية", color: "text-amber-600 dark:text-amber-400" },
    advanced: { label: "الميزات المتقدمة", color: "text-purple-600 dark:text-purple-400" },
  }

  const groupedTasks = tasks.reduce<Record<string, OnboardingTask[]>>(
    (acc, task) => {
      const category = task.category
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(task)
      return acc
    },
    {},
  )

  // Ensure all categories are initialized
  const categoriesOrder: Array<keyof typeof categories> = ["setup", "features", "advanced"]
  categoriesOrder.forEach((cat) => {
    if (!groupedTasks[cat]) {
      groupedTasks[cat] = []
    }
  })

  return (
    <div className={cn("space-y-6", className)}>
      {/* Overall progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">تقدم الإعداد</h3>
          <span className="text-xs text-muted-foreground">
            {completedTasks.size} من {tasks.length} مكتمل
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tasks by category */}
      {Object.entries(groupedTasks).map(([category, categoryTasks]) => {
        const config = categories[category as keyof typeof categories]
        const categoryCompleted = categoryTasks.filter((t) =>
          completedTasks.has(t.id),
        ).length

        return (
          <div key={category} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className={cn("text-sm font-medium", config.color)}>
                {config.label}
              </h4>
              <span className="text-xs text-muted-foreground">
                {categoryCompleted}/{categoryTasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {categoryTasks.map((task) => {
                const isCompleted = completedTasks.has(task.id)

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                      isCompleted
                        ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                        : "border-line bg-surface",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        isCompleted
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isCompleted ? (
                        <Check size={10} />
                      ) : (
                        <Circle size={10} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5
                        className={cn(
                          "text-sm font-medium",
                          isCompleted
                            ? "text-green-700 dark:text-green-400"
                            : "text-foreground",
                        )}
                      >
                        {task.title}
                      </h5>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {task.description}
                      </p>
                    </div>
                    {task.link ? (
                      <a
                        href={task.link}
                        className="text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        الذهاب
                      </a>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ProgressTrackingCardProps {
  tasks: OnboardingTask[]
  className?: string
}

/**
 * Compact progress tracking card for dashboards.
 */
/**
 * @description Component
 */
export function ProgressTrackingCard({
  tasks,
  className,
}: ProgressTrackingCardProps) {
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const completed = new Set<string>()
    tasks.forEach((task) => {
      const status = localStorage.getItem(`task-${task.storageKey}`)
      if (status === "completed") {
        completed.add(task.id)
      }
    })
    setCompletedTasks(completed)
  }, [tasks])

  const progress = tasks.length === 0 ? 0 : (completedTasks.size / tasks.length) * 100

  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-foreground">تقدم الإعداد</h4>
          <p className="text-xs text-muted-foreground">
            {completedTasks.size} من {tasks.length} مكتمل
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-16 w-16 relative">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted"
              />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${progress} 100`}
                className="text-primary"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-medium text-foreground">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-primary hover:text-primary/80 transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "إخفاء" : "عرض"}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-4">
          <ProgressTracking tasks={tasks} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Hook to mark a task as completed.
 */
export function useTaskCompletion(storageKey: string) {
  const [isCompleted, setIsCompleted] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(`task-${storageKey}`) === "completed"
  })

  const markCompleted = useCallback(() => {
    localStorage.setItem(`task-${storageKey}`, "completed")
    setIsCompleted(true)
  }, [storageKey])

  const reset = useCallback(() => {
    localStorage.removeItem(`task-${storageKey}`)
    setIsCompleted(false)
  }, [storageKey])

  return { isCompleted, markCompleted, reset }
}
