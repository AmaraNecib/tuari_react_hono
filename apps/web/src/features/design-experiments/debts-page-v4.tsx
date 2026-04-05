import { Button } from "@/components/ui/button"
import { formatDebtMoney } from "@/features/debts/debt-utils"
import { DesignSwitcher } from "./design-switcher"
export function DebtsPageV4({ rows = [], totals = {openCount: 0, owedToUsDzd: 0, owedByUsDzd: 0}, onCreateDebt, onCreateExternalCounterparty, onOpenWorker, onOpenExternalCounterparty }: any) {
  return (
    <div dir="rtl" className="w-full p-4 border-[3px] border-foreground bg-background shadow-[8px_8px_0_0_currentColor] mb-12">
      <DesignSwitcher currentVersion={4} currentEntity="debts" />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6"><div><h1 className="text-4xl font-extrabold tracking-tight mb-2">مركز الديون V4</h1></div>
          <div className="flex gap-3"><Button size="lg" onClick={onCreateDebt}>إضافة دين</Button></div></div>
        <div className="grid grid-cols-3 border-[2px] border-foreground mb-8">
          <div className="border-[2px] border-foreground p-4 bg-muted/20 border-l-[2px]"><p className="text-sm text-muted-foreground mb-1">حسابات مفتوحة</p><p className="text-2xl font-bold">{totals.openCount}</p></div>
          <div className="border-[2px] border-foreground p-4 bg-muted/20 border-l-[2px]"><p className="text-sm text-emerald-600 mb-1">لنا عندهم</p><p className="text-2xl font-mono text-emerald-700">دج {formatDebtMoney(totals.owedToUsDzd)}</p></div>
          <div className="border-[2px] border-foreground p-4 bg-muted/20"><p className="text-sm text-rose-600 mb-1">علينا لهم</p><p className="text-2xl font-mono text-rose-700">دج {formatDebtMoney(totals.owedByUsDzd)}</p></div></div>
      <div className="border-[2px] border-foreground w-full overflow-x-auto">
        <table className="w-full text-start">
          <thead className="bg-foreground text-background font-bold">
            <tr><th className="py-3 px-4 text-start">الطرف</th><th className="py-3 px-4 text-start">الرصيد</th></tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (<tr key={row.accountId} className="border-b-[2px] border-foreground py-3 font-mono"><td className="py-3 px-4 font-semibold">{row.name}</td><td className="py-3 px-4 font-mono">دج {formatDebtMoney(row.balanceDzd)}</td></tr>))}
          </tbody>
        </table>
      </div>
      
    </div>
  )
}