import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Surface } from "@/features/shared/page-primitives"
import { cn } from "@/lib/utils"

export function AppShellSectionSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Surface variant="panel" className={cn("overflow-hidden", className)} dir="rtl">
      {children}
    </Surface>
  )
}

export function AppShellSectionBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-6 p-6 xl:p-7", className)} dir="rtl">{children}</div>
}

export function AppShellTableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-line", className)} dir="rtl">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function AppShellTableHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <thead className={cn("bg-bg-2 border-b border-line", className)}>
      {children}
    </thead>
  )
}

export function AppShellTableHeaderCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-2.5 text-start text-[12px] font-mono font-semibold uppercase tracking-widest text-ink-4", className)} scope="col">
      {children}
    </th>
  )
}

export function AppShellTableRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("border-t border-line bg-surface hover:bg-surface-2 transition-colors", className)}>
      {children}
    </tr>
  )
}

export function AppShellEmptyStateRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td className="px-4 py-8 text-center text-[13px] text-ink-3" colSpan={colSpan}>
        {children}
      </td>
    </tr>
  )
}

export function AppShellActionGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap justify-start gap-1.5", className)} dir="rtl">{children}</div>
}

export function AppShellActionButtonWithReason({
  children,
  disabled,
  reason,
  onClick,
  size,
  variant,
}: {
  children: ReactNode
  disabled: boolean
  reason: string | null
  onClick: () => void
  size: "xs"
  variant: Parameters<typeof Button>[0]["variant"]
}) {
  const button = (
    <span className="inline-flex">
      <Button disabled={disabled} size={size} variant={variant} onClick={onClick}>
        {children}
      </Button>
    </span>
  )

  if (!disabled || !reason) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="top">{reason}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Extensible filter bar. Uses flex-wrap so filters naturally flow into rows
 * without cramping. Each direct child should be a filter <label> with a
 * consistent min-width so alignment stays clean at every breakpoint.
 */
export function AppShellFilterShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-line bg-bg-2 p-4",
        className,
      )}
      dir="rtl"
    >
      {children}
    </div>
  )
}

/**
 * Pairs two date inputs (from / to) on a single row so they always stay
 * together and never split across lines.  Labels use i18n keys for Arabic
 * RTL display: "من تاريخ" and "إلى تاريخ".
 */
export function DateRangeFilter({
  fromLabel,
  toLabel,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  fromPlaceholder,
  toPlaceholder,
}: {
  fromLabel: string
  toLabel: string
  fromDate: string
  toDate: string
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  fromPlaceholder?: string
  toPlaceholder?: string
}) {
  return (
    <div className="flex items-end gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{fromLabel}</span>
        <DatePicker
          value={fromDate}
          placeholder={fromPlaceholder}
          onChange={onFromDateChange}
        />
      </label>
      <span className="pb-2.5 text-sm text-muted-foreground">—</span>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{toLabel}</span>
        <DatePicker
          value={toDate}
          placeholder={toPlaceholder}
          onChange={onToDateChange}
        />
      </label>
    </div>
  )
}

export function usePaginatedRows<T>({
  rows,
  initialPageSize = 10,
  resetPageDeps = [],
}: {
  rows: T[]
  initialPageSize?: number
  resetPageDeps?: ReadonlyArray<unknown>
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, rows])
  const resetKey = JSON.stringify(resetPageDeps)

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rows.length / pageSize))
    if (page > maxPage) {
      setPage(maxPage)
    }
  }, [page, pageSize, rows.length])

  return {
    page,
    pageSize,
    pagedRows,
    setPage,
    setPageSize,
  }
}
