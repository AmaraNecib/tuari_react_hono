import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Surface } from "@/features/shared/page-primitives"
import { RecordPageFrame } from "@/features/shared/record-page-frame"

import { formatDebtMoney, getDebtBalanceMeta } from "@/features/debts/debt-utils"

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

  return (
    <RecordPageFrame
      title={t("externalsPage.title")}
      description={t("externalsPage.description")}
      action={<Button size="lg" onClick={onCreate}>{t("externalsPage.addButton")}</Button>}
    >
      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t("columns.name")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("columns.phone")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("columns.totalBalance", "إجمالي الرصيد")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("columns.cases", "الحالات")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("columns.notes", "ملاحظات")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {counterparties.length > 0 ? (
                counterparties.map((counterparty) => {
                  const balanceMeta = getDebtBalanceMeta(counterparty.totalBalanceDzd)

                  return (
                    <tr key={counterparty.id} className="border-t border-border/60 bg-background/75">
                      <td className="px-4 py-4 text-start font-medium text-foreground">{counterparty.fullName}</td>
                      <td className="px-4 py-4 text-start text-foreground">
                        <bdi dir="ltr">{counterparty.phone}</bdi>
                      </td>
                      <td className={balanceMeta.textClassName + " px-4 py-4 text-start font-mono"} dir="ltr">
                        دج {formatDebtMoney(counterparty.totalBalanceDzd)}
                      </td>
                      <td className="px-4 py-4 text-start text-foreground">
                        {counterparty.totalCaseCount} {t("externalsPage.caseUnit", "حالة")}{counterparty.openCaseCount ? `، ${counterparty.openCaseCount} ${t("externalsPage.openCases", "مفتوحة")}` : ""}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{counterparty.note?.trim() || "—"}</td>
                      <td className="px-4 py-4 text-start">
                        <Button size="sm" variant="outline" onClick={() => onOpen(counterparty.id)}>
                          {t("externalsPage.openFile")}
                        </Button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-12 text-center" colSpan={6}>
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-muted-foreground">{t("externalsPage.empty")}</p>
                      <Button size="sm" onClick={onCreate}>{t("externalsPage.addButton")}</Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>
    </RecordPageFrame>
  )
}
