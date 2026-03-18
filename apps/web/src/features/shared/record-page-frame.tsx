import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { Button, buttonVariants } from "@/components/ui/button"
import { i18n } from "@/i18n"
import { cn } from "@/lib/utils"

export function RecordPageFrame({
  title,
  description,
  backHref,
  backLabel,
  editHref,
  editLabel,
  children,
}: {
  title: string
  description?: string
  backHref: string
  backLabel: string
  editHref?: string
  editLabel?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "border-primary/18 bg-sidebar text-primary shadow-sm hover:border-primary/30 hover:bg-sidebar hover:text-primary dark:bg-input/30",
            )}
            to={backHref}
          >
            {backLabel}
          </Link>
          {editHref && editLabel ? (
            <Link
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "shadow-sm")}
              to={editHref}
            >
              {editLabel}
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  )
}

export function RecordTabs({
  activeTab,
  tabs,
  onChange,
}: {
  activeTab: string
  tabs: Array<{ id: string; label: string }>
  onChange: (tabId: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-[24px] border border-border/60 bg-muted/20 p-2">
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          className={cn(
            "min-w-[9.5rem] rounded-[18px] px-4 shadow-sm",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-border/70 bg-sidebar text-foreground hover:border-primary/20 hover:bg-sidebar hover:text-foreground dark:bg-background/60",
          )}
          size="lg"
          variant={activeTab === tab.id ? "default" : "outline"}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  )
}

export function RecordInfoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>
}

export function RecordInfoCard({
  label,
  value,
  wide = false,
  valueClassName,
}: {
  label: string
  value: ReactNode
  wide?: boolean
  valueClassName?: string
}) {
  return (
    <article className={`min-w-0 flex flex-col gap-1.5 rounded-[22px] border border-border/70 bg-sidebar px-5 py-3.5 shadow-sm dark:bg-background/60 ${wide ? "md:col-span-2 xl:col-span-3" : ""}`}>
      <p className="text-[0.8rem] font-medium leading-5 text-muted-foreground">{label}</p>
      <div className={`min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[1.05rem] font-semibold leading-8 text-foreground ${valueClassName ?? ""}`.trim()}>{value}</div>
    </article>
  )
}

export function RecordHistoryTable({
  columns,
  emptyLabel,
  rows,
}: {
  columns?: {
    type?: string
    details?: string
    period?: string
    status?: string
  }
  emptyLabel: string
  rows: Array<{
    id: string
    typeLabel: string
    title: string
    detail?: string | null
    periodLabel: string
    statusLabel: string
  }>
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-sidebar shadow-sm dark:bg-background/60">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground dark:bg-muted/45">
            <tr>
              <th className="px-4 py-3 text-right font-medium">{columns?.type ?? i18n.t("detailPages.shared.historyType")}</th>
              <th className="px-4 py-3 text-right font-medium">{columns?.details ?? i18n.t("detailPages.shared.historyDetails")}</th>
              <th className="px-4 py-3 text-right font-medium">{columns?.period ?? i18n.t("detailPages.shared.historyPeriod")}</th>
              <th className="px-4 py-3 text-right font-medium">{columns?.status ?? i18n.t("detailPages.shared.historyStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60 bg-sidebar dark:bg-background">
                  <td className="px-4 py-4 text-right text-muted-foreground">{row.typeLabel}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{row.title}</p>
                      {row.detail ? <p className="text-xs leading-5 text-muted-foreground">{row.detail}</p> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right text-muted-foreground">{row.periodLabel}</td>
                  <td className="px-4 py-4 text-right text-foreground">{row.statusLabel}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RecordHistoryCard({
  title,
  emptyLabel,
  items,
}: {
  title: string
  emptyLabel: string
  items: Array<{ id: string; label: string; secondary: string; badge: string }>
}) {
  return (
    <article className="rounded-[28px] border border-border/70 bg-sidebar p-4 dark:bg-background/60">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="rounded-[22px] border border-border/60 bg-sidebar px-4 py-3 dark:bg-background">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.secondary}</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{item.badge}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </article>
  )
}
