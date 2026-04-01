import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react"

import { cn } from "@/lib/utils"

type SurfaceVariant = "panel" | "card" | "inset" | "table" | "subtle"

const surfaceVariantClassNames: Record<SurfaceVariant, string> = {
  panel: "surface-panel",
  card: "surface-card",
  inset: "surface-inset",
  table: "surface-table",
  subtle: "surface-subtle",
}

function Surface<TElement extends ElementType = "section">({
  as,
  className,
  variant = "panel",
  children,
  ...props
}: {
  as?: TElement
  className?: string
  variant?: SurfaceVariant
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<TElement>, "as" | "children" | "className">) {
  const Component = as ?? "section"

  return (
    <Component
      className={cn("rounded-[30px]", surfaceVariantClassNames[variant], className)}
      {...props}
    >
      {children}
    </Component>
  )
}

function PageHeader({
  title,
  description,
  action,
  titleAs = "h1",
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  titleAs?: "h1" | "h2"
  className?: string
}) {
  const TitleTag = titleAs

  return (
    <header className={cn("page-header xl:flex-row xl:items-end xl:justify-between", className)} dir="rtl">
      <div className="space-y-2 text-end">
        <TitleTag className={cn("text-balance font-semibold tracking-[-0.02em] text-foreground", titleAs === "h1" ? "text-3xl md:text-[2.05rem]" : "text-2xl md:text-[1.7rem]")}>{title}</TitleTag>
        {description ? <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex w-full flex-wrap items-center justify-end gap-3 xl:w-auto">{action}</div> : null}
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
  return <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
}

function PageFooterActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-end gap-3", className)} dir="rtl">
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
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-start md:justify-between", className)} dir="rtl">
      <div className="space-y-1.5 text-end">
        <h3 className="text-lg font-semibold tracking-[-0.015em] text-foreground">{title}</h3>
        {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto">{action}</div> : null}
    </div>
  )
}

export { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, Surface, SurfaceHeader }
