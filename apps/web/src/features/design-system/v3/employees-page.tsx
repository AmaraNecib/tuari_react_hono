import { EmployeesSection as OriginalEmployeesSection } from "@/features/app-shell/employees-section"

export function EmployeesSectionV3(props: any) {
  return (
    <div className="max-w-6xl mx-auto p-6 md:p-12 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-[3rem]">
      <div className="rounded-[2rem] border-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_4px_20px_rgba(0,0,0,0.05)] bg-white/50 dark:bg-black/50 backdrop-blur-xl p-6">
        <h2 className="text-xl font-bold mb-4">Employees V3 Variation</h2>
        <OriginalEmployeesSection {...props} />
      </div>
    </div>
  )
}
