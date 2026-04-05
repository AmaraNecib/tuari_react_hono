import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function DebtCreatePageV3({ navigation, employees = [] }: any) {
  return (
    <div dir="rtl" className="max-w-2xl mx-auto p-8 bg-background shadow-[0_12px_40px_rgba(0,0,0,0.06)] rounded-[2rem] mt-10">
      <DesignSwitcher currentVersion={3} currentEntity="debt-create" />
      <div className="mb-10 flex justify-between items-end pb-4"><div><h1 className="text-4xl font-extrabold tracking-tight">إضافة دين V3</h1></div></div>
      <div className="space-y-8">
        <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground uppercase">المبلغ (دج)</label>
          <input type="number" placeholder="0.00" className={"w-full outline-none " + "border-none bg-muted/40 rounded-2xl p-4 focus:ring-2 focus:ring-primary/20 transition-all"} /></div>
        <div className="pt-6"><Button size="lg" className="w-full rounded-2xl shadow-lg">حفظ الرصيد</Button></div>
      </div>
      
    </div>
  )
}