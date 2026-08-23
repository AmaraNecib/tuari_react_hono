/**
 * LoadErrorSurface — shared loading/error surface primitive.
 *
 * One presentation-layer component for the feature pages that used to
 * hand-roll their own "icon + message + retry" block (debts hub, invoice
 * details, license settings). Data logic (isPending/isError branching,
 * retained-data guards) stays in the callers; this component only renders.
 */
import type { ComponentType, ReactNode } from "react"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { Surface } from "./page-primitives"

export type LoadErrorSurfaceIcon = ComponentType<{ className?: string }>

export type LoadErrorSurfaceProps = {
  /** Show the centered loading state instead of the error state. */
  isLoading?: boolean
  /**
   * Render the error state (icon + message + retry). Defaults to true when
   * not loading, so callers can render the surface only from their error
   * branch; pass false to render `children` (the content slot) instead.
   */
  isError?: boolean
  /** Translated error message. */
  message: string
  /** Translated loading label (shown when isLoading). */
  loadingLabel?: string
  /** Translated retry button label. */
  retryLabel: string
  /** Retry action. */
  onRetry: () => void
  /** Error-state icon (lucide-react icon; defaults to TriangleAlert). */
  icon?: LoadErrorSurfaceIcon
  /** Extra classes for the outer Surface (e.g. "border-destructive/25 p-6"). */
  className?: string
  /**
   * Extra classes merged into the error-branch Surface only, after className.
   * Lets callers override the default destructive border (e.g. a neutral
   * "border-line" panel) without affecting the loading branch.
   */
  errorClassName?: string
  /** Extra classes for the centered content container. */
  contentClassName?: string
  /** Extra classes for the error icon. */
  iconClassName?: string
  /** Extra classes for the error message paragraph. */
  messageClassName?: string
  /**
   * Optional custom content: rendered inside the error surface below the
   * retry button, or bare when isError is false (caller owns the surface).
   */
  children?: ReactNode
}

// Default dialect shared by the debts + invoice load-error surfaces.
const DEFAULT_CONTENT_CLASS = "flex flex-col items-center gap-4 py-10 text-center"
const DEFAULT_ICON_CLASS = "h-10 w-10 text-destructive"
const DEFAULT_MESSAGE_CLASS = "max-w-md text-sm leading-6 text-foreground"

/**
 * @description Component
 */
export function LoadErrorSurface({
  isLoading = false,
  isError,
  message,
  loadingLabel,
  retryLabel,
  onRetry,
  icon: Icon = TriangleAlert,
  className,
  errorClassName,
  contentClassName,
  iconClassName,
  messageClassName,
  children,
}: LoadErrorSurfaceProps) {
  if (isLoading) {
    return (
      <Surface className={className} role="status" variant="panel">
        <div className={cn("flex items-center justify-center py-12", contentClassName)}>
          <p className="text-sm text-muted-foreground">{loadingLabel}</p>
        </div>
      </Surface>
    )
  }

  if (isError === false) {
    return <>{children}</>
  }

  return (
    <Surface className={cn("border-destructive/25 p-6", className, errorClassName)} role="alert" variant="panel">
      <div className={cn(DEFAULT_CONTENT_CLASS, contentClassName)}>
        <Icon aria-hidden="true" className={cn(DEFAULT_ICON_CLASS, iconClassName)} />
        <p className={cn(DEFAULT_MESSAGE_CLASS, messageClassName)}>{message}</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
        {children}
      </div>
    </Surface>
  )
}