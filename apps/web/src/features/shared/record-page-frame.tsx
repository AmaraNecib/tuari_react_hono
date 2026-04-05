import { type KeyboardEvent, type ReactNode, useId, useMemo, useRef } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "@/features/app-shell/app-shell-table-primitives"
import { cn } from "@/lib/utils"

import { PageActionGroup, PageHeader, PageSurfaceContent, Surface } from "./page-primitives"

function getTabId(baseId: string, tabId: string) {
  return `${baseId}-tab-${tabId}`
}

function getPanelId(baseId: string, tabId: string) {
  return `${baseId}-panel-${tabId}`
}

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
  backHref: string
  backLabel: string
  editHref?: string
  editLabel?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Surface variant="panel">
      <PageSurfaceContent>
        <PageHeader
          action={
            <PageActionGroup>
            {editHref && editLabel ? (
              <Link className={cn(buttonVariants({ variant: "default", size: "lg" }))} to={editHref}>
                {editLabel}
              </Link>
            ) : null}
            {action ? action : null}
            <Link
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-primary/20 bg-background/75 text-primary hover:border-primary/35 hover:text-primary",
              )}
              to={backHref}
            >
              {backLabel}
            </Link>
            </PageActionGroup>
          }
          description={description}
          title={title}
        />
        {children}
      </PageSurfaceContent>
    </Surface>
  )
}

export function RecordTabs({
  activeTab,
  baseId,
  tabs,
  onChange,
}: {
  activeTab: string
  baseId?: string
  tabs: Array<{ id: string; label: string }>
  onChange: (tabId: string) => void
}) {
  const { t } = useTranslation()
  const generatedId = useId()
  const resolvedBaseId = useMemo(() => (baseId ?? `record-tabs-${generatedId}`).replace(/:/g, ""), [baseId, generatedId])
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function focusTab(index: number) {
    tabRefs.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const closestDirection = event.currentTarget.closest("[dir]")?.getAttribute("dir")
    const isRtl = (closestDirection ?? document.documentElement.dir) === "rtl"
    const previousIndex = index === 0 ? tabs.length - 1 : index - 1
    const nextIndex = index === tabs.length - 1 ? 0 : index + 1

    let targetIndex: number | null = null

    switch (event.key) {
      case "ArrowLeft":
        targetIndex = isRtl ? nextIndex : previousIndex
        break
      case "ArrowRight":
        targetIndex = isRtl ? previousIndex : nextIndex
        break
      case "Home":
        targetIndex = 0
        break
      case "End":
        targetIndex = tabs.length - 1
        break
      default:
        break
    }

    if (targetIndex === null) {
      return
    }

    const targetTab = tabs[targetIndex]

    if (!targetTab) {
      return
    }

    event.preventDefault()
    onChange(targetTab.id)
    focusTab(targetIndex)
  }

  return (
    <div
      aria-label={t("detailPages.shared.recordTabsLabel")}
      aria-orientation="horizontal"
      className="surface-subtle flex flex-wrap gap-2 rounded-[24px] p-2"
      role="tablist"
    >
      {tabs.map((tab, index) => (
        <Button
          ref={(node) => {
            tabRefs.current[index] = node
          }}
          aria-controls={getPanelId(resolvedBaseId, tab.id)}
          aria-selected={activeTab === tab.id}
          id={getTabId(resolvedBaseId, tab.id)}
          key={tab.id}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={cn(
            "min-w-[9.5rem] rounded-[18px] px-4",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-border/70 bg-background/80 text-foreground hover:border-primary/20 hover:bg-muted/60 hover:text-foreground dark:bg-background/60",
          )}
          size="lg"
          type="button"
          variant={activeTab === tab.id ? "default" : "outline"}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  )
}

export function RecordTabPanel({
  activeTab,
  baseId,
  tabId,
  children,
  className,
}: {
  activeTab: string
  baseId: string
  tabId: string
  children: ReactNode
  className?: string
}) {
  const isActive = activeTab === tabId

  if (!isActive) {
    return null
  }

  return (
    <div
      aria-labelledby={getTabId(baseId, tabId)}
      className={className}
      id={getPanelId(baseId, tabId)}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
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
    <Surface as="article" className={cn("min-w-0 flex flex-col gap-1.5 rounded-[22px] px-5 py-3.5", wide ? "md:col-span-2 xl:col-span-3" : "")} variant="card">
      <p className="text-[0.8rem] font-medium leading-5 text-muted-foreground">{label}</p>
      <div className={`min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[1.05rem] font-semibold leading-8 text-foreground ${valueClassName ?? ""}`.trim()}>{value}</div>
    </Surface>
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
  const { t } = useTranslation()

  return (
    <Surface className="overflow-hidden" variant="table">
      <AppShellTableFrame className="rounded-[30px] border-0">
        <table className="min-w-full text-sm">
          <AppShellTableHead className="bg-muted/45 dark:bg-muted/55">
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
                <AppShellTableRow key={row.id} className="bg-background/75 dark:bg-background">
                  <td className="px-4 py-4 text-start text-muted-foreground">{row.typeLabel}</td>
                  <td className="px-4 py-4 text-start">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{row.title}</p>
                      {row.detail ? <p className="text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{row.detail}</p> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-start text-muted-foreground">{row.periodLabel}</td>
                  <td className="px-4 py-4 text-start text-foreground">{row.statusLabel}</td>
                </AppShellTableRow>
              ))
            ) : (
              <AppShellEmptyStateRow colSpan={4}>{emptyLabel}</AppShellEmptyStateRow>
            )}
          </tbody>
        </table>
      </AppShellTableFrame>
    </Surface>
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
    <Surface as="article" className="p-4" variant="table">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <Surface key={item.id} className="rounded-[22px] px-4 py-3" variant="inset">
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
