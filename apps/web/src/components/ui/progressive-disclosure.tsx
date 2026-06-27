import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useMobileLayout } from "@/hooks/use-mobile-layout"
import { cn } from "@/lib/utils"

interface ProgressiveDisclosureProps {
  /** Primary content always visible */
  primary: React.ReactNode
  /** Secondary content hidden on mobile by default */
  secondary: React.ReactNode
  /** Label for the toggle button */
  toggleLabel?: string
  /** Whether secondary content is initially expanded on mobile */
  defaultExpanded?: boolean
  className?: string
}

/**
 * Progressive disclosure component that hides secondary content on mobile.
 * Users can tap to reveal more details.
 */
export function ProgressiveDisclosure({
  primary,
  secondary,
  toggleLabel = "Show more",
  defaultExpanded = false,
  className,
}: ProgressiveDisclosureProps) {
  const { isMobile } = useMobileLayout()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  if (!isMobile) {
    // On desktop, show everything
    return (
      <div className={className}>
        {primary}
        {secondary}
      </div>
    )
  }

  return (
    <div className={className}>
      {primary}
      <button
        type="button"
        className="mt-2 flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <>
            <span>{toggleLabel}</span>
            <ChevronUp size={14} />
          </>
        ) : (
          <>
            <span>{toggleLabel}</span>
            <ChevronDown size={14} />
          </>
        )}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {secondary}
      </div>
    </div>
  )
}
