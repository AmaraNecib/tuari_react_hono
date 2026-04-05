import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function DebtCreatePageV2({ navigation, employees = [] }: any) {
  return (
    <div dir="rtl" className="flex flex-col md:flex-row min-h-screen bg-background">
      <DesignSwitcher currentVersion={2} currentEntity="debt-create" />
      <div className="md:w-1/3 bg-muted/20 p-8 border-r border-border/60"><h1 className="text-3xl font-bold mb-4">تسجيل دين V2</h1></div><div className="md:w-2/3 p-8 lg:p-16 max-w-2xl">
      <div className="space-y-8">
        <div className="space-y-2"><label className="text-sm font-semibold text-muted-foreground uppercase">المبلغ (دج)</label>
          <input type="number" placeholder="0.00" className={"w-full outline-none " + "border border-border/60 rounded-md bg-muted/10 p-3"} /></div>
        <div className="pt-6"><Button size="lg" className="">حفظ الرصيد</Button></div>
      </div>
      </div>
    </div>
  )
}