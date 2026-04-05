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
  return (
    <RecordPageFrame
      title="الجهات الخارجية"
      description="قائمة مستقلة للجهات الخارجية مع إجمالي الرصيد وعدد حالات الدين المنفصلة لكل جهة."
      action={<Button size="lg" onClick={onCreate}>إضافة جهة خارجية</Button>}
    >
      <Surface className="overflow-hidden" variant="table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الاسم</th>
                <th className="px-4 py-3 text-start font-medium">الهاتف</th>
                <th className="px-4 py-3 text-start font-medium">إجمالي الرصيد</th>
                <th className="px-4 py-3 text-start font-medium">الحالات</th>
                <th className="px-4 py-3 text-start font-medium">ملاحظات</th>
                <th className="px-4 py-3 text-start font-medium">الإجراء</th>
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
                        {counterparty.totalCaseCount} حالة{counterparty.openCaseCount ? `، ${counterparty.openCaseCount} مفتوحة` : ""}
                      </td>
                      <td className="px-4 py-4 text-start text-muted-foreground">{counterparty.note?.trim() || "—"}</td>
                      <td className="px-4 py-4 text-start">
                        <Button size="sm" variant="outline" onClick={() => onOpen(counterparty.id)}>
                          فتح الملف
                        </Button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                    لا توجد أطراف خارجية بعد.
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
