import { EmployeesSection as OriginalEmployeesSection } from "@/features/app-shell/employees-section"

export function EmployeesSectionV1(props: any) {
  return (
    <div className="max-w-full px-0 py-0">
      <div className="rounded-none border-0 shadow-none bg-background p-6">
        <h2 className="text-xl font-bold mb-4">Employees V1 Variation</h2>
        <OriginalEmployeesSection {...props} />
      </div>
    </div>
  )
}
