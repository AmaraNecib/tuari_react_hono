import { useId, useState, type ReactNode } from "react"

import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  /** Section title shown on the toggle header. */
  title: string
  /** Optional muted hint under the title. */
  description?: ReactNode
  /** Content revealed when expanded. Hidden entirely (not mounted) when collapsed. */
  children: ReactNode
  /** Whether the section starts expanded. Defaults to collapsed. */
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
}

/**
 * A compact disclosure section: a full-width toggle header (title + chevron)
 * that reveals its content in a labelled region. Direction-neutral chevrons and
 * flow layout only, so it stays correct in RTL. Content is not mounted while
 * collapsed, so hidden fields stay out of both the layout and the a11y tree.
 *
 * Open state is component-local `useState`, so a section whose parent re-renders
 * (but does not remount it) keeps its expansion state — e.g. adding/removing
 * invoice line items must not collapse the header sections.
 */
/**
 * @description Component
 */
export function CollapsibleSection({
  title,
  description,
  children,
  defaultOpen = false,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const headerId = useId()
  const contentId = useId()

  return (
    <section className={cn("rounded-xl border border-border/75 bg-background/50", className)}>
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 rounded-xl"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{title}</span>
          {description ? <span className="truncate text-xs font-normal text-muted-foreground">{description}</span> : null}
        </span>
        {open ? (
          <ChevronUp size={16} aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown size={16} aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          className={cn("px-3 pb-3 pt-1", contentClassName)}
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}