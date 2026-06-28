/**
 * Form field component with label, error, and hint support.
 * Provides consistent spacing and accessibility for form controls.
 */
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface FieldProps {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
  labelClassName?: string
}

function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
  labelClassName,
}: FieldProps) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className={cn("text-sm font-medium text-foreground", labelClassName)}>
        {label}
        {required && <span className="ms-1 text-destructive">*</span>}
      </span>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </label>
  )
}

export { Field }
export type { FieldProps }
