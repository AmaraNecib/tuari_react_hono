import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function DebtCreatePageV4({ navigation, employees = [] }: any) {
  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-8 border-[3px] border-foreground bg-background shadow-[12px_12px_0_0_currentColor] mt-10">
      <DesignSwitcher currentVersion={4} currentEntity="debt-create" />
      <div className="mb-10 flex justify-between items-end pb-4"><div><h1 className="text-4xl font-extrabold tracking-tight">إضافة دين V4</h1></div></div>
      <div className="space-y-8">
        <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground uppercase">المبلغ (دج)</label>
          <input type="number" placeholder="0.00" className={"w-full outline-none " + "border-[2px] border-foreground bg-background p-3 rounded-none font-bold placeholder:font-normal"} /></div>
        <div className="pt-6"><Button size="lg" className="w-full rounded-none border-[2px] border-foreground shadow-[4px_4px_0_0_black]">حفظ الرصيد</Button></div>
      </div>
      
    </div>
  )
}