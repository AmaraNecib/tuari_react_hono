import { useState } from "react"
import { Check, ChevronRight, RotateCcw, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface TutorialStep {
  /** Unique identifier */
  id: string
  /** Step title */
  title: string
  /** Step instructions */
  instructions: string
  /** Validation function - returns true if step is complete */
  validate: () => boolean
  /** Optional hint if user is stuck */
  hint?: string
  /** Optional sample data to populate */
  sampleData?: Record<string, unknown>
}

interface InteractiveTutorialProps {
  /** Tutorial steps */
  steps: TutorialStep[]
  /** Tutorial title */
  title: string
  /** Tutorial description */
  description: string
  /** Unique key for localStorage persistence */
  storageKey: string
  /** Callback when tutorial completes */
  onComplete?: () => void
  /** Additional className */
  className?: string
}

/**
 * Interactive tutorial with step-by-step validation.
 * Users perform real actions and get feedback.
 */
export function InteractiveTutorial({
  steps,
  title,
  description,
  storageKey,
  onComplete,
  className,
}: InteractiveTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [showHint, setShowHint] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  const step = steps[currentStep]
  const isStepValid = step?.validate() ?? false
  const progress = (completedSteps.size / steps.length) * 100

  const handleValidate = () => {
    if (isStepValid && step) {
      const newCompleted = new Set(completedSteps)
      newCompleted.add(step.id)
      setCompletedSteps(newCompleted)

      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1)
        setShowHint(false)
      } else {
        setIsCompleted(true)
        localStorage.setItem(`tutorial-${storageKey}`, "completed")
        onComplete?.()
      }
    }
  }

  const handleRestart = () => {
    setCurrentStep(0)
    setCompletedSteps(new Set())
    setShowHint(false)
    setIsCompleted(false)
    localStorage.removeItem(`tutorial-${storageKey}`)
  }

  return (
    <div className={cn("rounded-xl border border-line bg-surface p-6", className)}>
      {/* Header */}
      <div className="mb-6 space-y-2">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>التقدم</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {isCompleted ? (
        /* Completion state */
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <Trophy size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <h4 className="text-lg font-semibold text-foreground">
            أحسنت! لقد أكملت الدورة
          </h4>
          <p className="mt-2 text-sm text-muted-foreground">
            أنت الآن جاهز لاستخدام هذه الميزة
          </p>
          <Button className="mt-4" onClick={handleRestart}>
            <RotateCcw size={14} className="me-2" />
            إعادة الدورة
          </Button>
        </div>
      ) : (
        /* Tutorial steps */
        <div className="space-y-4">
          {/* Step list */}
          <div className="space-y-2">
            {steps.map((s, index) => {
              const isCompletedStep = completedSteps.has(s.id)
              const isCurrent = index === currentStep

              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    isCurrent
                      ? "border-primary/50 bg-primary/5"
                      : isCompletedStep
                        ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                        : "border-line bg-muted/30",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      isCompletedStep
                        ? "bg-green-500 text-white"
                        : isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isCompletedStep ? (
                      <Check size={12} />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4
                      className={cn(
                        "text-sm font-medium",
                        isCurrent ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s.title}
                    </h4>
                    {isCurrent ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {s.instructions}
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Current step actions */}
          {step ? (
            <div className="space-y-3">
              {/* Hint */}
              {step.hint ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                    onClick={() => setShowHint(!showHint)}
                  >
                    {showHint ? "إخفاء التلميح" : "أحتاج مساعدة"}
                  </button>
                  {showHint ? (
                    <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                      {step.hint}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Validate button */}
              <Button
                className="w-full"
                disabled={!isStepValid}
                onClick={handleValidate}
              >
                تحقق من الإكمال
                <ChevronRight size={14} className="me-1" />
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

interface TutorialCardProps {
  title: string
  description: string
  storageKey: string
  steps: TutorialStep[]
  icon?: React.ComponentType<{ size?: number; className?: string }>
  className?: string
}

/**
 * Compact tutorial card for use in dashboards or help sections.
 */
export function TutorialCard({
  title,
  description,
  storageKey,
  steps,
  icon: Icon,
  className,
}: TutorialCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isCompleted = localStorage.getItem(`tutorial-${storageKey}`) === "completed"

  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon size={20} className="text-primary" />
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">{title}</h4>
            {isCompleted ? (
              <span className="text-xs text-green-600 dark:text-green-400">
                مكتمل
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "إخفاء" : "ابدأ"}
        </Button>
      </div>

      {isExpanded ? (
        <div className="mt-4">
          <InteractiveTutorial
            steps={steps}
            title={title}
            description={description}
            storageKey={storageKey}
          />
        </div>
      ) : null}
    </div>
  )
}
