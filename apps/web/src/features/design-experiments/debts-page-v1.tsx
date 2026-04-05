import { Button } from "@/components/ui/button"
import { formatDebtMoney } from "@/features/debts/debt-utils"
import { DesignSwitcher } from "./design-switcher"
export function DebtsPageV1({ rows = [], totals = {openCount: 0, owedToUsDzd: 0, owedByUsDzd: 0}, onCreateDebt, onCreateExternalCounterparty, onOpenWorker, onOpenExternalCounterparty }: any) {
  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 py-8 bg-background">
      <DesignSwitcher currentVersion={1} currentEntity="debts" />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6"><div><h1 className="text-4xl font-extrabold tracking-tight mb-2">مركز الديون V1</h1></div>
          <div className="flex gap-3"><Button size="lg" onClick={onCreateDebt}>إضافة دين</Button></div></div>
        <div className="flex gap-12 pb-6 border-b border-border/40">
          <div className=""><p className="text-sm text-muted-foreground mb-1">حسابات مفتوحة</p><p className="text-2xl font-bold">{totals.openCount}</p></div>
          <div className=""><p className="text-sm text-emerald-600 mb-1">لنا عندهم</p><p className="text-2xl font-mono text-emerald-700">دج {formatDebtMoney(totals.owedToUsDzd)}</p></div>
          <div className=""><p className="text-sm text-rose-600 mb-1">علينا لهم</p><p className="text-2xl font-mono text-rose-700">دج {formatDebtMoney(totals.owedByUsDzd)}</p></div></div>
      <div className="mt-8 w-full overflow-x-auto">
        <table className="w-full text-start">
          <thead className="text-muted-foreground text-sm border-b-2 border-border/60">
            <tr><th className="py-3 px-4 text-start">الطرف</th><th className="py-3 px-4 text-start">الرصيد</th></tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (<tr key={row.accountId} className="border-b border-border/40 hover:bg-muted/10 transition-colors py-4"><td className="py-3 px-4 font-semibold">{row.name}</td><td className="py-3 px-4 font-mono">دج {formatDebtMoney(row.balanceDzd)}</td></tr>))}
          </tbody>
        </table>
      </div>
      
    </div>
  )
}