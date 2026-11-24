/**
 * Table pagination controls for navigating through data.
 * Provides page size selection and navigation buttons.
 */
import { useTranslation } from "react-i18next"

import { NativeSelect } from "@/components/ui/form-controls"
import { Surface } from "@/features/shared/page-primitives"
import { Pagination } from "@/components/ui/data-table"

const presetPageSizes = [10, 25, 50, 100]

/**
 * @description Component
 */
export function TablePaginationControls({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const end = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount)

  return (
    <Surface variant="subtle" className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">
        {t("tables.range", { end, start, total: totalCount })}
      </p>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("tables.rowsPerPage")}</span>
          <div className="w-24">
            <NativeSelect aria-label={t("tables.rowsPerPage")} value={String(pageSize)} onChange={(event) => onPageSizeChange(Number(event.target.value) || 10)}>
              {presetPageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <Pagination page={page} pages={totalPages} total={totalCount} start={start} end={end}
          label={t("tables.rowsPerPage")} previousLabel={t("tables.previous")} nextLabel={t("tables.next")}
          countLabel={`${page} / ${totalPages}`} onPageChange={onPageChange} />
      </div>
    </Surface>
  )
}
