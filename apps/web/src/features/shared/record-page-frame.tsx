import { type KeyboardEvent, type ReactNode, useId, useMemo, useRef } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { buttonVariants } from "@/components/ui/button"
import {
  AppShellEmptyStateRow,
  AppShellTableFrame,
  AppShellTableHead,
  AppShellTableHeaderCell,
  AppShellTableRow,
} from "@/features/app-shell/app-shell-table-primitives"
import { cn } from "@/lib/utils"

import { PageActionGroup, PageHeader, Surface } from "./page-primitives"

function getTabId(baseId: string, tabId: string) {
  return `${baseId}-tab-${tabId}`
}

function getPanelId(baseId: string, tabId: string) {
  return `${baseId}-panel-${tabId}`
}

/** Frame for detail/edit pages with action bar. */
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
      className="flex flex-wrap gap-0 border-b border-line"
      role="tablist"
    >
      {tabs.map((tab, index) => (
        <button
          ref={(node) => {
            tabRefs.current[index] = node
          }}
          aria-controls={getPanelId(resolvedBaseId, tab.id)}
          aria-selected={activeTab === tab.id}
          id={getTabId(resolvedBaseId, tab.id)}
          key={tab.id}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
          className={cn(
            "relative px-5 py-2.5 text-[13px] font-medium transition-colors outline-none",
            activeTab === tab.id
              ? "text-ink after:absolute after:inset-x-0 after:bottom-[-1px] after:h-[2px] after:bg-primary after:rounded-full"
              : "text-ink-3 hover:text-ink-2",
          )}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
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
    <article className={cn("min-w-0 flex flex-col gap-1 border border-line rounded-xl px-4 py-3 bg-surface", wide ? "md:col-span-2 xl:col-span-3" : "")}>
      <p className="text-[12px] font-mono font-semibold uppercase tracking-widest text-ink-4">{label}</p>
      <div className={cn("min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[14px] font-medium text-ink leading-snug", valueClassName)}>
        {value}
      </div>
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
