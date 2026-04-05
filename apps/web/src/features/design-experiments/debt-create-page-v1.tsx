import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function DebtCreatePageV1({ navigation, employees = [] }: any) {
  return (
    <div dir="rtl" className="max-w-3xl mx-auto py-12 px-6 bg-background">
      <DesignSwitcher currentVersion={1} currentEntity="debt-create" />
      <div className="mb-10 flex justify-between items-end pb-4"><div><h1 className="text-4xl font-extrabold tracking-tight">إضافة دين V1</h1></div></div>
      <div className="space-y-8">
        <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground uppercase">المبلغ (دج)</label>
          <input type="number" placeholder="0.00" className={"w-full outline-none " + "border-0 border-b-2 border-border/40 focus:border-primary rounded-none bg-transparent px-0 text-xl py-3"} /></div>
        <div className="pt-6"><Button size="lg" className="rounded-full px-8">حفظ الرصيد</Button></div>
      </div>
      
    </div>
  )
}