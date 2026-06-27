import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ResponsiveFormProps {
  children: ReactNode
  className?: string
}

interface ResponsiveFormGridProps {
  children: ReactNode
  className?: string
  /** Number of columns on desktop */
  columns?: 1 | 2 | 3 | 4
}

interface ResponsiveFormActionsProps {
  children: ReactNode
  className?: string
  /** Stack actions vertically on mobile */
  stackOnMobile?: boolean
}

/**
 * Responsive form wrapper with consistent spacing.
 */
export function ResponsiveForm({ children, className }: ResponsiveFormProps) {
  return <form className={cn("space-y-6", className)}>{children}</form>
}

/**
 * Responsive form grid that adapts columns based on screen size.
 */
export function ResponsiveFormGrid({ children, className, columns = 2 }: ResponsiveFormGridProps) {
  const columnClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  }

  return (
    <div className={cn("grid gap-4", columnClasses[columns], className)}>
      {children}
    </div>
  )
}

export function ResponsiveFormActions({ children, className, stackOnMobile = true }: ResponsiveFormActionsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        stackOnMobile && "flex-col sm:flex-row sm:justify-end",
        !stackOnMobile && "justify-end",
        className,
      )}
    >
      {children}
    </div>
  )
}

interface ResponsiveFormFieldProps {
  label: string
  description?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

export function ResponsiveFormField({ label, description, error, required, children, className }: ResponsiveFormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ms-1">*</span>}
      </label>
      {children}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
