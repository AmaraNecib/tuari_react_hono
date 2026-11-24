import { i18n as featureI18n } from "@/i18n"
/**
 * External counterparties listing page.
 */
import { CurrencyRun } from "@/features/shared/money-value"
import { DEBT_BALANCE_STATE_PHRASE } from "@tuari/contracts"
import { formatExactMoney } from "@/features/shared/exact-money-display"
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
import { TablePaginationControls } from "@/features/shared/table-pagination-controls"


const DEFAULT_PAGE_SIZE = 25

/**
 * @description Component
 */
export function ExternalCounterpartiesPage({
  counterparties,
  onCreate,
  onOpen,
}: {
  counterparties: Array<{
    id: string
    fullName: string
    note: string | null
    openAccountCount: number
    phone: string
    totalBalanceDzd: string
    totalAccountCount: number
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
              <TableHead>{t("columns.totalBalance")}</TableHead>
              <TableHead>{t("externalsPage.accounts")}</TableHead>
              <TableHead>{t("columns.notes")}</TableHead>
              <TableHead>{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedCounterparties.length > 0 ? (
              pagedCounterparties.map((counterparty) => {
                const display = formatExactMoney(counterparty.totalBalanceDzd, { aggregate: true, grouped: true })
                const comparison = display.zero ? 0 : counterparty.totalBalanceDzd.startsWith("-") ? -1 : 1
                const balance = {
                  phrase: comparison === 0 ? DEBT_BALANCE_STATE_PHRASE.settled : comparison > 0 ? DEBT_BALANCE_STATE_PHRASE.owedToUs : DEBT_BALANCE_STATE_PHRASE.owedByUs,
                  amount: display.text.replace(/^-/, ""),
                  textClassName: comparison === 0 ? "text-muted-foreground" : comparison > 0 ? "text-good" : "text-bad",
                }

                return (
                  <TableRow key={counterparty.id}>
                    <TableCell className="font-medium">{counterparty.fullName}</TableCell>
                    <TableCell>
                      <bdi dir="ltr">{counterparty.phone}</bdi>
                    </TableCell>
                    <TableCell className={balance.textClassName}>
                      <span className="block text-xs font-medium">{balance.phrase}</span>
                      <span className="font-mono" dir="ltr"><CurrencyRun amount={balance.amount} currencyLabel={featureI18n.t("featureCopy.externalsPage.currency")} /></span>
                    </TableCell>
                    <TableCell>
                      {counterparty.totalAccountCount} {t("externalsPage.accountUnit")}{counterparty.openAccountCount ? featureI18n.t("featureCopy.externalsPage.balanceSeparator", { value1: counterparty.openAccountCount, value2: t("externalsPage.openAccounts") }) : ""}
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
