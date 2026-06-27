import { useState } from "react"
import { HelpCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ContextualHelpProps {
  /** Help content */
  content: string
  /** Optional title */
  title?: string
  /** Optional link URL */
  linkUrl?: string
  /** Optional link text */
  linkText?: string
  /** Position relative to trigger */
  position?: "top" | "bottom" | "left" | "right"
  /** Additional className */
  className?: string
}

/**
 * Contextual help tooltip that appears on hover or click.
 * Shows help information near the relevant UI element.
 */
export function ContextualHelp({
  content,
  title,
  linkUrl,
  linkText,
  position = "top",
  className,
}: ContextualHelpProps) {
  const [isOpen, setIsOpen] = useState(false)

  const positionClasses = {
    top: "bottom-full start-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full start-1/2 -translate-x-1/2 mt-2",
    left: "end-full top-1/2 -translate-y-1/2 mr-2",
    right: "start-full top-1/2 -translate-y-1/2 ml-2",
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        aria-label="Help"
      >
        <HelpCircle size={14} />
      </button>

      {isOpen ? (
        <div
          className={cn(
            "absolute z-50 w-64 rounded-xl border border-line bg-card p-3 shadow-lg",
            positionClasses[position],
          )}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="flex items-start justify-between gap-2">
            {title ? (
              <h4 className="text-sm font-medium text-foreground">{title}</h4>
            ) : null}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <X size={12} />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{content}</p>
          {linkUrl ? (
            <a
              href={linkUrl}
              className="mt-2 inline-block text-xs text-primary hover:text-primary/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              {linkText ?? "learn more"}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface HelpHintProps {
  /** Hint text */
  hint: string
  /** Additional className */
  className?: string
}

/**
 * Simple help hint that shows on hover.
 */
export function HelpHint({ hint, className }: HelpHintProps) {
  return (
    <span
      className={cn(
        "group/help relative inline-flex items-center",
        className,
      )}
    >
      <HelpCircle size={12} className="text-muted-foreground group-hover/help:text-foreground transition-colors" />
      <span className="absolute bottom-full start-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg border border-line bg-card p-2 text-xs text-muted-foreground shadow-lg opacity-0 group-hover/help:opacity-100 transition-opacity pointer-events-none">
        {hint}
      </span>
    </span>
  )
}

interface FieldHelpProps {
  /** Help content */
  content: string
  /** Field label for accessibility */
  fieldLabel?: string
  /** Additional className */
  className?: string
}

/**
 * Help icon for form fields.
 * Shows contextual help next to field labels.
 */
export function FieldHelp({ content, className }: FieldHelpProps) {
  return (
    <ContextualHelp
      content={content}
      position="right"
      className={className}
    />
  )
}
