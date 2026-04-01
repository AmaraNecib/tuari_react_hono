import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
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
    <div className={cn("overflow-hidden rounded-[28px] border border-border/60", className)} dir="rtl">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function AppShellTableHead({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={cn("bg-muted/60 text-muted-foreground", className)}>{children}</thead>
}

export function AppShellTableHeaderCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-3 text-end font-medium", className)} scope="col">
      {children}
    </th>
  )
}

export function AppShellTableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-t border-border/60 bg-background/10", className)}>{children}</tr>
}

export function AppShellEmptyStateRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={colSpan}>
        {children}
      </td>
    </tr>
  )
}

export function AppShellActionGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap justify-end gap-2", className)} dir="rtl">{children}</div>
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

export function AppShellFilterShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-3 rounded-[24px] border border-border/60 bg-background/12 p-4 md:grid-cols-2 xl:grid-cols-5", className)} dir="rtl">
      {children}
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
