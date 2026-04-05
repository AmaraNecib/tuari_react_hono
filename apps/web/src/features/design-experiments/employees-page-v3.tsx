import { Button } from "@/components/ui/button"
import { DesignSwitcher } from "./design-switcher"
export function EmployeesPageV3({ employees = [], onCreate, onOpen }: any) {
  return (
    <div dir="rtl" className="max-w-6xl mx-auto py-10 px-6 bg-[#f8f9fa] dark:bg-[#0f1218] min-h-screen">
      <DesignSwitcher currentVersion={3} currentEntity="employees" />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4"><div><h1 className="text-4xl font-extrabold tracking-tight mb-2">العاملون V3</h1></div></div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employees.map((emp: any) => (
          <div key={emp.id} className="p-6 bg-background rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all flex flex-col gap-4">
            <h3 className="text-xl font-bold">{emp.name}</h3><span dir="ltr">{emp.phone}</span>
            <Button variant="secondary" onClick={() => onOpen(emp.id)}>عرض التفاصيل</Button>
          </div>
        ))}
      </div>
      
    </div>
  )
}