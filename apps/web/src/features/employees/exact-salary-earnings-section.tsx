import { useMemo, useState } from "react"
import { useBlocker } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { exactSalaryEarningStatusSchema, exactProjectSalaryCostSchema, type ExactWorkforceClient } from "@tuari/contracts"
import { useEmployeesQuery, useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { useSessionQuery } from "@/features/session/use-session-query"
import { WorkspaceLink } from "@/router/navigation"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/features/shared/money-value"
import { ExactMonthlySalaryApprovalForm, type SalaryApprovalState } from "./exact-monthly-salary-approval-form"

/** Product salary page. All identities and financial requests belong to the signed-in configured workspace. */
export function ExactSalaryEarningsSection({ projects, workforceClient, onPendingCommandChange }: { projects: readonly { id: string; name: string }[]; workforceClient: ExactWorkforceClient; onPendingCommandChange: (pending: boolean) => void }) {
  const { t } = useTranslation()
  const session = useSessionQuery()
  const userId = session.data?.user?.id ?? null
  const employees = useEmployeesQuery()
  const [employeeId, setEmployeeId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [approvalState, setApprovalState] = useState<SalaryApprovalState>("idle")
  const blocked = approvalState === "pending" || approvalState === "uncertain"
  useBlocker({ shouldBlockFn: () => blocked, enableBeforeUnload: blocked })
  const selected = employees.data?.items.find(row => row.id === employeeId) ?? (blocked && employeeId ? { id: employeeId } : undefined)
  const selectedProject = projects.find(row => row.id === projectId)
  const queryClient = useQueryClient()
  const client = useMemo(() => ({ approveMonthlyEarnings: async (input: Parameters<ExactWorkforceClient["approveMonthlyEarnings"]>[0]) => {
    const result = await workforceClient.approveMonthlyEarnings(input)
    // Cache refresh is not approval. A failed read must not turn a committed result into a new command.
    void queryClient.invalidateQueries({ queryKey: ["workspace", userId, "exact-workforce"] })
    return result
  } }), [queryClient, userId, workforceClient])
  const earnings = useWorkspaceScopedQuery({
    key: user => ["workspace", user, "exact-workforce", "employee", employeeId] as const,
    enabled: Boolean(selected),
    queryFn: async () => exactSalaryEarningStatusSchema.array().parse(await workforceClient.listEmployeeEarnings({ employeeId })),
  })
  const cost = useWorkspaceScopedQuery({
    key: user => ["workspace", user, "exact-workforce", "project", projectId] as const,
    enabled: Boolean(selectedProject),
    queryFn: async () => exactProjectSalaryCostSchema.parse(await workforceClient.getProjectSalaryCost({ projectId })),
  })
  const now = new Date()
  const defaultMonth = `${now.getFullYear().toString().padStart(4, "0")}-${(now.getMonth() + 1).toString().padStart(2, "0")}`
  return <section className="space-y-6" aria-label={t("salaryEarnings.title")}>
    {employees.isPending ? <p role="status">{t("common.loading")}</p> : employees.isError ? <div role="alert"><p>{t("salaryEarnings.error")}</p><Button onClick={() => { void employees.refetch() }}>{t("salaryEarnings.retry")}</Button></div> : employees.data?.items.length === 0 ? <div className="space-y-3"><p>{t("salaryEarnings.noEmployees")}</p><WorkspaceLink target={{ to: "/employees/create" }}>{t("salaryEarnings.createEmployee")}</WorkspaceLink></div> : <label className="block max-w-md space-y-2 text-sm">{t("salaryEarnings.employee")}
      <select className="min-h-11 w-full rounded-md border border-input bg-background px-3" disabled={blocked} value={selected?.id ?? ""} onChange={event => { if (!blocked) setEmployeeId(event.target.value) }}>
        <option value="">{t("salaryEarnings.chooseEmployee")}</option>
        {employees.data?.items.map(employee => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
      </select>
    </label>}
    {blocked && <p role="status" className="text-sm">{t("salaryEarnings.pending")}</p>}
    {selected && <div className="space-y-6">
      {earnings.isPending ? <p role="status">{t("salaryEarnings.loading")}</p> : earnings.isError && earnings.data === undefined ? <div role="alert" className="space-y-3"><p>{t("salaryEarnings.error")}</p><Button onClick={() => { void earnings.refetch() }}>{t("salaryEarnings.retry")}</Button></div> : <>
        <ExactMonthlySalaryApprovalForm key={`${userId}:${selected.id}`} employeeId={selected.id} defaultMonth={defaultMonth} projects={projects} client={client} onAttemptStateChange={state => { setApprovalState(state); onPendingCommandChange(state === "pending" || state === "uncertain") }} />
        <section className="space-y-3 border-t pt-5" aria-label={t("salaryEarnings.saved")}><h3 className="font-medium">{t("salaryEarnings.saved")}</h3>
          {earnings.data?.length === 0 ? <p>{t("salaryEarnings.empty")}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th scope="col" className="py-3 text-start">{t("salaryEarnings.period")}</th><th scope="col" className="py-3 text-start">{t("salaryEarnings.amount")}</th><th scope="col" className="py-3 text-start">{t("salaryEarnings.remaining")}</th></tr></thead><tbody>{earnings.data?.map(row => <tr key={row.earning.id} className="border-b"><th scope="row" className="py-3 text-start font-normal"><bdi dir="ltr">{row.earning.periodStart} / {row.earning.periodEnd}</bdi></th><td className="px-2 py-3"><MoneyValue exact value={row.earning.approvedAmount} currencyLabel={t("common.currency")} /></td><td className="py-3"><MoneyValue exact value={row.remainingAmount} currencyLabel={t("common.currency")} /></td></tr>)}</tbody></table></div>}
        </section>
        {earnings.isError && earnings.data !== undefined && <div role="alert" className="space-y-3"><p>{t("salaryEarnings.error")}</p><Button onClick={() => { void earnings.refetch() }}>{t("salaryEarnings.retry")}</Button></div>}
      </>}
    </div>}
    {projects.length > 0 && <section className="space-y-3 border-t pt-5"><label className="block max-w-md space-y-2 text-sm">{t("salaryEarnings.project")}<select className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={selectedProject?.id ?? ""} onChange={event => setProjectId(event.target.value)}><option value="">{t("salaryEarnings.chooseProject")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {selectedProject && (cost.isPending ? <p role="status">{t("common.loading")}</p> : cost.isError ? <p role="alert">{t("salaryEarnings.projectError")}</p> : cost.data && <div className="flex flex-wrap gap-3"><span>{t("salaryEarnings.projectCost")}</span><MoneyValue exact aggregate value={cost.data.totalAmount} currencyLabel={t("common.currency")} /></div>)}
    </section>}
  </section>
}
