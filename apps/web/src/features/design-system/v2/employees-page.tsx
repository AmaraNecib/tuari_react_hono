import { EmployeesSection as OriginalEmployeesSection } from "@/features/app-shell/employees-section"

export function EmployeesSectionV2(props: any) {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="rounded-sm border-2 border-black dark:border-white shadow-[4px_4px_0_0_rgba(0,0,0,1)] bg-background p-6">
        <h2 className="text-xl font-bold mb-4">Employees V2 Variation</h2>
        <OriginalEmployeesSection {...props} />
      </div>
    </div>
  )
}
