/**
 * External counterparties listing page.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { TablePaginationControls } from "@/features/app-shell/table-pagination-controls"

import { formatDebtMoney, getDebtBalanceMeta } from "@/features/debts/debt-utils"

const DEFAULT_PAGE_SIZE = 25

export function ExternalCounterpartiesPage({
  counterparties,
  onCreate,
  onOpen,
}: {
  counterparties: Array<{
    id: string
    fullName: string
    note: string | null
    openCaseCount: number
    phone: string
    totalBalanceDzd: number
    totalCaseCount: number
  }>
  onCreate: () => void
  onOpen: (counterpartyId: string) => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const pagedCounterparties = counterparties.slice((page - 1) * pageSize, page * pageSize)

  return (
    <RecordPageFrame
      title={t("externalsPage.title")}
      description={t("externalsPage.description")}
      action={<Button size="lg" onClick={onCreate}>{t("externalsPage.addButton")}</Button>}
    >
      <div className="overflow-hidden rounded-xl border border-line">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.phone")}</TableHead>
              <TableHead>{t("columns.totalBalance", "إجمالي الرصيد")}</TableHead>
              <TableHead>{t("columns.cases", "الحالات")}</TableHead>
              <TableHead>{t("columns.notes", "ملاحظات")}</TableHead>
              <TableHead>{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedCounterparties.length > 0 ? (
              pagedCounterparties.map((counterparty) => {
                const balanceMeta = getDebtBalanceMeta(counterparty.totalBalanceDzd)

                return (
                  <TableRow key={counterparty.id}>
                    <TableCell className="font-medium">{counterparty.fullName}</TableCell>
                    <TableCell>
                      <bdi dir="ltr">{counterparty.phone}</bdi>
                    </TableCell>
                    <TableCell className={balanceMeta.textClassName} dir="ltr">
                      دج {formatDebtMoney(counterparty.totalBalanceDzd)}
                    </TableCell>
                    <TableCell>
                      {counterparty.totalCaseCount} {t("externalsPage.caseUnit", "حالة")}{counterparty.openCaseCount ? `، ${counterparty.openCaseCount} ${t("externalsPage.openCases", "مفتوحة")}` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{counterparty.note?.trim() || "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => onOpen(counterparty.id)}>
                        {t("externalsPage.openFile")}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-muted-foreground">{t("externalsPage.empty")}</p>
                    <Button size="sm" onClick={onCreate}>{t("externalsPage.addButton")}</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {counterparties.length > 0 && (
        <TablePaginationControls
          page={page}
          pageSize={pageSize}
          totalCount={counterparties.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}
    </RecordPageFrame>
  )
}
