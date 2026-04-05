import { Button } from "@/components/ui/button"
import { formatDebtMoney } from "@/features/debts/debt-utils"
import { DesignSwitcher } from "./design-switcher"
export function DebtsPageV2({ rows = [], totals = {openCount: 0, owedToUsDzd: 0, owedByUsDzd: 0}, onCreateDebt, onCreateExternalCounterparty, onOpenWorker, onOpenExternalCounterparty }: any) {
  return (
    <div dir="rtl" className="flex flex-col md:flex-row min-h-screen bg-background">
      <DesignSwitcher currentVersion={2} currentEntity="debts" />
      <div className="md:w-1/3 bg-muted/40 p-8 border-r border-border/60"><h1 className="text-3xl font-bold mb-8">الديون (V2)</h1>
          <div className="space-y-6"><div><p className="text-muted-foreground text-sm uppercase mb-1">الرصيد الكلي لنا</p><p className="text-4xl font-mono text-emerald-600">+{formatDebtMoney(totals.owedToUsDzd)}</p></div>
            <div><p className="text-muted-foreground text-sm uppercase mb-1">الرصيد الكلي علينا</p><p className="text-4xl font-mono text-rose-600">-{formatDebtMoney(totals.owedByUsDzd)}</p></div>
            <div className="pt-8 flex flex-col gap-3"><Button size="lg" onClick={onCreateDebt}>إضافة دين</Button></div></div></div><div className="md:w-2/3 p-8">
      <div className="mt-8 w-full overflow-x-auto">
        <table className="w-full text-start">
          <thead className="text-muted-foreground text-sm border-b-2 border-border/60">
            <tr><th className="py-3 px-4 text-start">الطرف</th><th className="py-3 px-4 text-start">الرصيد</th></tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (<tr key={row.accountId} className="border-b border-border/40 py-3 text-sm"><td className="py-3 px-4 font-semibold">{row.name}</td><td className="py-3 px-4 font-mono">دج {formatDebtMoney(row.balanceDzd)}</td></tr>))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}