import type { ReactNode } from "react"
import { useMobileLayout } from "@/hooks/use-mobile-layout"
import { cn } from "@/lib/utils"

interface ResponsiveTableProps {
  children: ReactNode
  className?: string
  /** Enable card view on mobile (default: true) */
  cardView?: boolean
}

interface ResponsiveTableHeaderProps {
  children: ReactNode
  className?: string
}

interface ResponsiveTableBodyProps {
  children: ReactNode
  className?: string
}

interface ResponsiveTableRowProps {
  children: ReactNode
  className?: string
}

interface ResponsiveTableHeadProps {
  children: ReactNode
  className?: string
  /** Label for card view on mobile */
  mobileLabel?: string
}

interface ResponsiveTableCellProps {
  children: ReactNode
  className?: string
  /** Label for card view on mobile */
  mobileLabel?: string
}

export function ResponsiveTable({ children, className, cardView = true }: ResponsiveTableProps) {
  const { isMobile } = useMobileLayout()

  return (
    <div className={cn("responsive-table-wrapper", className)}>
      {isMobile && cardView ? (
        <div className="table-card-view">{children}</div>
      ) : (
        <table className="responsive-table w-full caption-bottom text-sm">{children}</table>
      )}
    </div>
  )
}

export function ResponsiveTableHeader({ children, className }: ResponsiveTableHeaderProps) {
  return <thead className={cn("border-b border-line bg-bg-2", className)}>{children}</thead>
}

export function ResponsiveTableBody({ children, className }: ResponsiveTableBodyProps) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)}>{children}</tbody>
}

export function ResponsiveTableRow({ children, className }: ResponsiveTableRowProps) {
  const { isMobile } = useMobileLayout()

  return (
    <tr
      className={cn(
        "border-t border-line bg-surface transition-colors hover:bg-surface-2",
        isMobile && "flex flex-col gap-2 p-3 border rounded-xl",
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function ResponsiveTableHead({ children, className }: ResponsiveTableHeadProps) {
  const { isMobile } = useMobileLayout()

  if (isMobile) {
    return null // Hide headers in card view
  }

  return (
    <th
      className={cn(
        "px-4 py-2.5 text-start text-[12px] font-mono font-semibold uppercase tracking-widest text-ink-4",
        className,
      )}
      scope="col"
    >
      {children}
    </th>
  )
}

export function ResponsiveTableCell({ children, className, mobileLabel }: ResponsiveTableCellProps) {
  const { isMobile } = useMobileLayout()

  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-foreground",
        isMobile && "flex justify-between items-center border-none px-0 py-1.5",
        className,
      )}
      data-label={isMobile ? mobileLabel : undefined}
    >
      {children}
    </td>
  )
}
