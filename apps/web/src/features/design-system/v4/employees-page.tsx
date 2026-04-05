import { EmployeesSection as OriginalEmployeesSection } from "@/features/app-shell/employees-section"

export function EmployeesSectionV4(props: any) {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="rounded-xl border border-border/40 shadow-sm bg-card transition-all hover:shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Employees V4 Variation</h2>
        <OriginalEmployeesSection {...props} />
      </div>
    </div>
  )
}
