import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "./table-primitives"
import { cn } from "@/lib/utils"

import { PageActionGroup, PageHeader, Surface } from "./page-primitives"

/** Frame for detail/edit pages with action bar. */
/**
 * @description Component
 */
export function RecordPageFrame({
  title,
  description,
  backHref,
  backLabel,
  editHref,
  editLabel,
  action,
  children,
}: {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  editHref?: string
  editLabel?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <PageActionGroup>
          {editHref && editLabel ? (
            <Link className={cn(buttonVariants({ variant: "default", size: "sm" }))} to={editHref}>
              {editLabel}
            </Link>
          ) : null}
          {action ? action : null}
          {backHref && backLabel ? (
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              to={backHref}
            >
              {backLabel}
            </Link>
          ) : null}
          </PageActionGroup>
        }
        description={description}
        title={title}
      />
      {children}
    </div>
  )
}

/**
 * RecordTabs — wraps the shadcn Tabs component with a consistent
 * underline-style variant for detail page navigation.
 */
/**
 * @description Component
 */
export function RecordTabs({
  activeTab,
  tabs,
  onChange,
}: {
  activeTab: string
  baseId?: string
  tabs: Array<{ id: string; label: string }>
  onChange: (tabId: string) => void
}) {
  return (
    <Tabs value={activeTab} onValueChange={onChange}>
      <TabsList variant="line" className="w-full justify-start">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            id={`tab-trigger-${tab.id}`}
            aria-controls={`tab-${tab.id}`}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/**
 * RecordTabPanel — conditionally renders content based on active tab.
 * Use this outside the Tabs component to control visibility.
 */
/**
 * @description Component
 */
export function RecordTabPanel({
  activeTab,
  tabId,
  children,
  className,
}: {
  activeTab: string
  baseId?: string
  tabId: string
  children: ReactNode
  className?: string
}) {
  if (activeTab !== tabId) {
    return null
  }

  return (
    <div
      role="tabpanel"
      id={`tab-${tabId}`}
      aria-labelledby={`tab-trigger-${tabId}`}
      className={className}
    >
      {children}
    </div>
  )
}

/**
 * @description Component
 */
export function RecordInfoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>
}

/**
 * @description Component
 */
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
    <article className={cn("min-w-0 flex flex-col gap-1 px-4 py-3", wide ? "md:col-span-2 xl:col-span-3" : "")}>
      <p className="text-[12px] font-mono font-semibold uppercase tracking-widest text-ink-4">{label}</p>
      <div className={cn("min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[14px] font-medium text-ink leading-snug", valueClassName)}>
        {value}
      </div>
    </article>
  )
}

/**
 * @description Component
 */
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
  const { t } = useTranslation()

  return (
    <AppShellTableFrame>
      <table className="min-w-full text-sm">
          <AppShellTableHead>
            <tr>
              <AppShellTableHeaderCell>{columns?.type ?? t("detailPages.shared.historyType")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{columns?.details ?? t("detailPages.shared.historyDetails")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{columns?.period ?? t("detailPages.shared.historyPeriod")}</AppShellTableHeaderCell>
              <AppShellTableHeaderCell>{columns?.status ?? t("detailPages.shared.historyStatus")}</AppShellTableHeaderCell>
            </tr>
          </AppShellTableHead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <AppShellTableRow key={row.id}>
                  <td className="px-4 py-3 text-start text-ink-3 text-[13px]">{row.typeLabel}</td>
                  <td className="px-4 py-3 text-start">
                    <div className="space-y-0.5">
                      <p className="text-[13px] font-medium text-ink">{row.title}</p>
                      {row.detail ? <p className="text-[12px] leading-5 text-ink-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{row.detail}</p> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-start text-ink-3 text-[13px]">{row.periodLabel}</td>
                  <td className="px-4 py-3 text-start text-ink text-[13px]">{row.statusLabel}</td>
                </AppShellTableRow>
              ))
            ) : (
              <AppShellEmptyStateRow colSpan={4}>{emptyLabel}</AppShellEmptyStateRow>
            )}
          </tbody>
        </table>
    </AppShellTableFrame>
  )
}

/**
 * @description Component
 */
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
    <Surface as="article" className="p-4" variant="table">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <Surface key={item.id} className="rounded-xl px-4 py-3" variant="inset">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.secondary}</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{item.badge}</span>
              </div>
            </Surface>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </Surface>
  )
}
