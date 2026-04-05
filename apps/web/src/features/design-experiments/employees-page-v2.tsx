import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function EmployeesPageV2({ employees = [], onCreate, onOpen }: any) {
  return (
    <div dir="rtl" className="flex flex-col md:flex-row min-h-screen bg-background">
      <DesignSwitcher currentVersion={2} currentEntity="employees" />
      <div className="md:w-1/4 lg:w-1/5 bg-muted/30 p-6 border-r border-border/60"><h1 className="text-3xl font-bold mb-6">فريق العمل V2</h1></div><div className="md:w-3/4 lg:w-4/5 p-6 lg:p-10">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map((emp: any) => (
          <div key={emp.id} className="p-5 border border-border/60 bg-muted/10 rounded-sm flex flex-col gap-3">
            <h3 className="text-xl font-bold">{emp.name}</h3><span dir="ltr">{emp.phone}</span>
            <Button variant="ghost" onClick={() => onOpen(emp.id)}>عرض التفاصيل</Button>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}