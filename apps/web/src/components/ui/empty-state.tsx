import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  /** Icon to display */
  icon?: React.ComponentType<{ size?: number; className?: string }>
  /** Title of the empty state */
  title: string
  /** Description of what will appear here */
  description: string
  /** Why this feature matters */
  benefit?: string
  /** Primary action button */
  action?: {
    label: string
    onClick: () => void
  }
  /** Secondary action (e.g., import from template) */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  /** Optional illustration or custom content */
  illustration?: ReactNode
  /** Additional className */
  className?: string
}

/**
 * Enhanced empty state component following onboarding best practices.
 * Shows what will appear here, why it matters, and how to get started.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  benefit,
  action,
  secondaryAction,
  illustration,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className,
      )}
    >
      {/* Illustration or Icon */}
      {illustration ? (
        <div className="mb-6">{illustration}</div>
      ) : Icon ? (
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
          <Icon size={32} className="text-muted-foreground/60" />
        </div>
      ) : null}

      {/* Title */}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>

      {/* Description - What will be here */}
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>

      {/* Benefit - Why it matters */}
      {benefit ? (
        <p className="mt-2 max-w-sm text-xs text-muted-foreground/80">{benefit}</p>
      ) : null}

      {/* Actions - How to get started */}
      {(action || secondaryAction) ? (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {action ? (
            <Button onClick={action.onClick}>{action.label}</Button>
          ) : null}
          {secondaryAction ? (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface EmptyStateCardProps {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
  benefit?: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
}

/**
 * Empty state with card styling for use in tables or grids.
 */
export function EmptyStateCard({
  icon: Icon,
  title,
  description,
  benefit,
  action,
  secondaryAction,
  className,
}: EmptyStateCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/50 py-8 px-4 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
          <Icon size={24} className="text-muted-foreground/60" />
        </div>
      ) : null}

      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>

      {benefit ? (
        <p className="mt-1 max-w-xs text-xs text-muted-foreground/80">{benefit}</p>
      ) : null}

      {(action || secondaryAction) ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {action ? (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
