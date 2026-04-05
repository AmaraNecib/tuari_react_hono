import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function EmployeesPageV4({ employees = [], onCreate, onOpen }: any) {
  return (
    <div dir="rtl" className="w-full p-6 border-[3px] border-foreground bg-background shadow-[8px_8px_0_0_currentColor] mb-12">
      <DesignSwitcher currentVersion={4} currentEntity="employees" />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4"><div><h1 className="text-4xl font-extrabold tracking-tight mb-2">العاملون V4</h1></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-[2px] border-foreground">
        {employees.map((emp: any) => (
          <div key={emp.id} className="p-6 border-[1px] border-foreground flex flex-col gap-4 relative">
            <h3 className="text-xl font-bold">{emp.name}</h3><span dir="ltr">{emp.phone}</span>
            <Button variant="outline" onClick={() => onOpen(emp.id)}>عرض التفاصيل</Button>
          </div>
        ))}
      </div>
      
    </div>
  )
}