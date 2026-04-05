import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function FormLayout({
  children,
  onSubmit,
  className,
}: {
  children: ReactNode
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  className?: string
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={cn("relative flex h-full min-h-[calc(100vh-4rem)] flex-col", className)}
      dir="rtl"
    >
      <div className="flex-1 pb-24">
        <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
          {children}
        </div>
      </div>
    </form>
  )
}

export function FormHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground md:text-[2.05rem]">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  )
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-8 md:flex-row", className)}>
      <div className="shrink-0 md:w-1/3">
        <div className="sticky top-24">
          <h2 className="text-xl font-semibold tracking-[-0.015em] text-foreground">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      
      <div className="rounded-[30px] border border-border/50 bg-sidebar/50 p-6 shadow-sm surface-panel md:w-2/3 xl:p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          {children}
        </div>
      </div>
    </section>
  )
}

export function FormStickyFooter({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/80 p-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] backdrop-blur-md", className)} dir="rtl">
      <div className="mx-auto flex max-w-5xl justify-end gap-3 px-4">
        {children}
      </div>
    </div>
  )
}
