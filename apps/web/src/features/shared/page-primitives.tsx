/**
 * Page primitive components for consistent page layouts.
 */
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react"

import { cn } from "@/lib/utils"

/* ─── Entrance animation utilities ───
 * stagger-child: Applied to children of a stagger container.
 * Uses CSS animation with a custom property for delay.
 */
const staggerChild = "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-300 ease-out"

type SurfaceVariant = "panel" | "card" | "inset" | "table" | "subtle"

const surfaceVariantClassNames: Record<SurfaceVariant, string> = {
  panel:  "bg-surface border border-line",
  card:   "bg-surface border border-line",
  inset:  "bg-bg-2 border border-line",
  table:  "bg-surface border border-line",
  subtle: "bg-surface-2 border border-line",
}

function Surface<TElement extends ElementType = "section">({
  as,
  className,
  variant = "panel",
  animate = false,
  children,
  ...props
}: {
  as?: TElement
  className?: string
  variant?: SurfaceVariant
  animate?: boolean
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<TElement>, "as" | "children" | "className">) {
  const Component = as ?? "section"

  return (
    <Component
      className={cn(
        "rounded-xl",
        surfaceVariantClassNames[variant],
        animate && staggerChild,
        className
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
  titleAs = "h1",
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  titleAs?: "h1" | "h2"
  className?: string
}) {
  const TitleTag = titleAs

  return (
    <header className={cn("page-header flex w-full items-start justify-between gap-6", className)}>
      <div className="space-y-1 min-w-0">
        {eyebrow ? (
          <p className={cn("font-mono text-[12px] font-semibold tracking-widest uppercase text-ink-4", staggerChild, "[animation-delay:0ms]")}>{eyebrow}</p>
        ) : null}
        <TitleTag
          className={cn(
            "font-display leading-[1.1] tracking-tight text-ink",
            titleAs === "h1"
              ? "text-[2.4rem] italic"
              : "text-[1.8rem] italic",
            staggerChild, "[animation-delay:50ms]"
          )}
        >
          {title}
        </TitleTag>
        {description ? (
          <p className={cn("text-[14px] leading-snug text-ink-3 mt-1 max-w-[54ch]", staggerChild, "[animation-delay:100ms]")}>{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className={cn("flex items-center gap-2 shrink-0 pt-1", staggerChild, "[animation-delay:100ms]")}>{action}</div>
      ) : null}
    </header>
  )
}

function PageSurfaceContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("space-y-6 p-6 xl:p-7", className)}>{children}</div>
}

function PageActionGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
}

function PageFooterActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-end gap-3", className)}>
      {children}
    </div>
  )
}

function SurfaceHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex w-full items-start justify-between gap-4", className)}>
      <div className="space-y-0.5 text-start min-w-0">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="text-[12.5px] leading-5 text-ink-3">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2 shrink-0">{action}</div> : null}
    </div>
  )
}

/* ─── Stagger container ───
 * Use this wrapper to animate children sequentially.
 * Children with staggerChild class will animate with increasing delays.
 */
function StaggerContainer({
  children,
  className,
  as: Component = "div",
}: {
  children: ReactNode
  className?: string
  as?: ElementType
}) {
  return (
    <Component className={cn("[&>*]:stagger-child", className)}>
      {children}
    </Component>
  )
}

/* Flat 4-col stat band */
function StatBand({
  stats,
  className,
}: {
  stats: Array<{
    label: string
    value: string | number
    meta?: string
    tone?: "good" | "warn" | "bad" | "neutral"
  }>
  className?: string
}) {
  const toneClass: Record<string, string> = {
    good:    "text-good",
    warn:    "text-warn",
    bad:     "text-bad",
    neutral: "text-ink",
  }

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4", staggerChild, className)}>
      {stats.map((stat, i) => (
        <div
          key={i}
          className={cn(
            "px-5 py-4",
            i > 0 && "border-s border-line",
          )}
        >
          <p className="text-[12px] font-mono font-semibold uppercase tracking-widest text-ink-4 mb-1">{stat.label}</p>
          <p className={cn("text-[1.6rem] leading-none font-display tabular-nums tracking-tight", toneClass[stat.tone ?? "neutral"])}>
            {stat.value}
          </p>
          {stat.meta ? (
            <p className="text-[11px] text-ink-4 mt-1">{stat.meta}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, StaggerContainer, StatBand, Surface, SurfaceHeader, staggerChild }
