import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/form-controls"

/**
 * PaginationControls — reusable UI for cursor-based pagination.
 *
 * Pass `undefined` for a callback to indicate that direction is not
 * available (first page for `onPrevious`, last page for `onNext`). The
 * corresponding button is rendered disabled in that case.
 *
 * The component is purely presentational — it does not own cursor state.
 * Callers wire it to their own query/mutation hooks. Typically the
 * caller syncs `pageSize` and `cursor` to the URL so refresh keeps state.
 *
 * `availablePageSizes` lets each surface pick its own set (e.g. a smaller
 * dropdown for compact lists). Defaults to a sensible [10, 20, 50, 100]
 * set with 50 as the default.
 */
export type PaginationControlsProps = {
  shownCount: number
  total: number
  hasMore: boolean
  onPrevious: (() => void) | undefined
  onNext: (() => void) | undefined
  pageSize: number
  onPageSizeChange: (nextSize: number) => void
  availablePageSizes?: readonly number[]
  previousLabel?: string
  nextLabel?: string
  totalLabel?: string
  pageSizeLabel?: string
  isLoading?: boolean
}

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const

/** Cursor-based pagination controls with page size selector and prev/next buttons. */
export function PaginationControls({
  shownCount,
  total,
  hasMore,
  onPrevious,
  onNext,
  pageSize,
  onPageSizeChange,
  availablePageSizes = DEFAULT_PAGE_SIZES,
  previousLabel,
  nextLabel,
  totalLabel,
  pageSizeLabel,
  isLoading = false,
}: PaginationControlsProps) {
  const { t } = useTranslation()

  const resolvedPreviousLabel = previousLabel ?? t("common.previous", "السابق")
  const resolvedNextLabel = nextLabel ?? t("common.next", "التالي")
  const resolvedTotalLabel = totalLabel ?? t("common.total", "إجمالي")
  const resolvedPageSizeLabel = pageSizeLabel ?? t("tables.rowsPerPage", "عدد الصفوف")

  return (
    <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between" dir="rtl">
      <span aria-live="polite" className="text-sm text-muted-foreground">
        {resolvedTotalLabel}: {total}
      </span>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{resolvedPageSizeLabel}</span>
          <div className="w-24">
            <NativeSelect
              value={String(pageSize)}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isFinite(next) && next > 0) {
                  onPageSizeChange(next)
                }
              }}
              disabled={isLoading}
            >
              {availablePageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!onPrevious || isLoading}
            onClick={onPrevious}
            aria-label={resolvedPreviousLabel}
          >
            {resolvedPreviousLabel}
          </Button>
          <span className="text-xs text-muted-foreground">
            {shownCount} / {total}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasMore || !onNext || isLoading}
            onClick={onNext}
            aria-label={resolvedNextLabel}
          >
            {resolvedNextLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
