import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface WelcomeScreenProps {
  /** Product name */
  productName: string
  /** Value proposition - what is this product? */
  valueProposition: string
  /** What users will learn/accomplish */
  benefits: string[]
  /** Time estimate (honest) */
  timeEstimate?: string
  /** Primary action - get started */
  onGetStarted: () => void
  /** Skip option - for experienced users */
  onSkip?: () => void
  /** Skip label */
  skipLabel?: string
  /** Additional className */
  className?: string
}

/**
 * Welcome screen for first-run experience.
 * Shows value proposition, benefits, and time estimate.
 */
/**
 * @description Component
 */
export function WelcomeScreen({
  productName,
  valueProposition,
  benefits,
  timeEstimate,
  onGetStarted,
  onSkip,
  skipLabel = "I'll explore on my own",
  className,
}: WelcomeScreenProps) {
  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-bg px-6 py-12",
        className,
      )}
      dir="rtl"
    >
      <div className="w-full max-w-lg space-y-8 text-center">
        {/* Logo/Brand */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <span className="text-2xl font-display italic font-medium">ط</span>
          </div>
        </div>

        {/* Welcome message */}
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            مرحباً بك في {productName}
          </h1>
          <p className="text-lg text-muted-foreground">{valueProposition}</p>
        </div>

        {/* Benefits */}
        <div className="space-y-3 text-start">
          <h2 className="text-sm font-medium text-muted-foreground">ماذا ستتعلم:</h2>
          <ul className="space-y-2">
            {benefits.map((benefit, index) => (
              <li key={index} className="flex items-start gap-3 text-sm text-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {index + 1}
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* Time estimate */}
        {timeEstimate ? (
          <p className="text-xs text-muted-foreground">
            الوقت المطلوب: {timeEstimate}
          </p>
        ) : null}

        {/* Actions */}
        <div className="space-y-3">
          <Button className="h-12 w-full text-base" onClick={onGetStarted}>
            ابدأ الآن
          </Button>
          {onSkip ? (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={onSkip}
            >
              {skipLabel}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  )
}
