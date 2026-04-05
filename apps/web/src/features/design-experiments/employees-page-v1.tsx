import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function EmployeesPageV1({ employees = [], onCreate, onOpen }: any) {
  return (
    <div dir="rtl" className="max-w-6xl mx-auto py-8 px-4 bg-background">
      <DesignSwitcher currentVersion={1} currentEntity="employees" />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4"><div><h1 className="text-4xl font-extrabold tracking-tight mb-2">العاملون V1</h1></div></div>
      <div className="grid grid-cols-1 divide-y divide-border/40 border-t border-border/40">
        {employees.map((emp: any) => (
          <div key={emp.id} className="py-6 flex flex-col md:flex-row md:items-center justify-between hover:bg-muted/5 transition-colors gap-4">
            <h3 className="text-xl font-bold">{emp.name}</h3><span dir="ltr">{emp.phone}</span>
            <Button variant="ghost" onClick={() => onOpen(emp.id)}>عرض التفاصيل</Button>
          </div>
        ))}
      </div>
      
    </div>
  )
}