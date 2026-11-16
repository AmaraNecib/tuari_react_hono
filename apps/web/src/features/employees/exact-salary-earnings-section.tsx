import { useCallback, useEffect, useMemo, useState } from "react"
import { useBlocker } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { exactSalaryEarningStatusSchema, exactProjectSalaryCostSchema, type ExactEmployee, type ExactWorkforceEarningsClient } from "@tuari/contracts"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { useSessionQuery } from "@/features/session/use-session-query"
import { WorkspaceLink } from "@/router/navigation"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/features/shared/money-value"
import { ExactMonthlySalaryApprovalForm, type SalaryApprovalState } from "./exact-monthly-salary-approval-form"
import { browserMonthlyApprovalStore } from "./exact-monthly-approval-recovery"

/** Reads and approves exact earnings only. Cash payment controls remain unavailable. */
export function ExactSalaryEarningsSection({ projects, employees, workspaceId, userId, workforceClient, onPendingCommandChange }: {
  projects: readonly { id: string; name: string }[]
  employees: readonly ExactEmployee[]
  workspaceId: string
  userId: string
  workforceClient: ExactWorkforceEarningsClient
  onPendingCommandChange: (pending: boolean) => void
}) {
  const { t } = useTranslation()
  const session = useSessionQuery()
  const scopeValid = session.data?.user?.id === userId
  const recovery = useMemo(() => {
    try { return { record: browserMonthlyApprovalStore(workspaceId, userId).load(), error: null as string | null } }
    catch (error) { return { record: null, error: error instanceof Error ? error.message : "Monthly approval recovery is unreadable" } }
  }, [workspaceId, userId])
  const [employeeId, setEmployeeId] = useState(() => recovery.record?.employeeId ?? "")
  const [projectId, setProjectId] = useState("")
  const [approvalState, setApprovalState] = useState<SalaryApprovalState>(() => recovery.record || recovery.error ? "uncertain" : "idle")
  const blocked = !scopeValid || recovery.error !== null || recovery.record !== null || approvalState === "pending" || approvalState === "uncertain"
  const handleApprovalState = useCallback((state: SalaryApprovalState) => {
    setApprovalState(state)
    onPendingCommandChange(state === "pending" || state === "uncertain")
  }, [onPendingCommandChange])
  useEffect(() => { onPendingCommandChange(blocked) }, [blocked, onPendingCommandChange])
  useBlocker({ shouldBlockFn: () => blocked, enableBeforeUnload: blocked })
  const selected = employees.find(employee => employee.id === employeeId) ?? (blocked && employeeId ? { id: employeeId } : undefined)
  const selectedProject = projects.find(project => project.id === projectId)
  const queryClient = useQueryClient()
  const client = useMemo(() => ({ approveMonthlyEarnings: async (input: Parameters<ExactWorkforceEarningsClient["approveMonthlyEarnings"]>[0]) => {
    const result = await workforceClient.approveMonthlyEarnings(input)
    void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, userId, "exact-workforce"] })
    return result
  } }), [queryClient, userId, workforceClient, workspaceId])
  const earnings = useWorkspaceScopedQuery({
    key: user => ["workspace", workspaceId, user, "exact-workforce", "employee", employeeId] as const,
    enabled: Boolean(selected) && scopeValid,
    queryFn: async () => exactSalaryEarningStatusSchema.array().parse(await workforceClient.listEmployeeEarnings({ employeeId })),
  })
  const cost = useWorkspaceScopedQuery({
    key: user => ["workspace", workspaceId, user, "exact-workforce", "project", projectId] as const,
    enabled: Boolean(selectedProject) && scopeValid,
    queryFn: async () => exactProjectSalaryCostSchema.parse(await workforceClient.getProjectSalaryCost({ projectId })),
  })
  const now = new Date()
  const defaultMonth = `${now.getFullYear().toString().padStart(4, "0")}-${(now.getMonth() + 1).toString().padStart(2, "0")}`
  return <section className="space-y-6" aria-label={t("salaryEarnings.title")}>
    <p className="text-sm" role="note">{t("salaryEarnings.cashUnavailable")}</p>
    {!scopeValid || recovery.error ? <p role="alert">{t("salaryEarnings.error")}</p> : null}
    {employees.length === 0 ? <div className="space-y-3"><p>{t("salaryEarnings.noEmployees")}</p><WorkspaceLink target={{ to: "/employees/create" }}>{t("salaryEarnings.createEmployee")}</WorkspaceLink></div> : <label className="block max-w-md space-y-2 text-sm">{t("salaryEarnings.employee")}
      <select className="min-h-11 w-full rounded-md border border-input bg-background px-3" disabled={blocked} value={selected?.id ?? ""} onChange={event => { if (!blocked) setEmployeeId(event.target.value) }}>
        <option value="">{t("salaryEarnings.chooseEmployee")}</option>
        {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
      </select>
    </label>}
    {blocked && <p role="status" className="text-sm">{t("salaryEarnings.pending")}</p>}
    {selected && <div className="space-y-6">
      {scopeValid && !recovery.error && (!earnings.isError || recovery.record !== null || approvalState === "pending" || approvalState === "uncertain") && <ExactMonthlySalaryApprovalForm key={`${workspaceId}:${userId}:${selected.id}`} employeeId={selected.id} workspaceId={workspaceId} userId={userId} defaultMonth={defaultMonth} projects={projects} client={client} onAttemptStateChange={handleApprovalState} />}
      {earnings.isPending && <p role="status">{t("salaryEarnings.loading")}</p>}
      {earnings.isError && <div role="alert" className="space-y-3"><p>{t("salaryEarnings.error")}</p><Button onClick={() => { void earnings.refetch() }}>{t("salaryEarnings.retry")}</Button></div>}
      {earnings.data !== undefined && <section className="space-y-3 border-t pt-5" aria-label={t("salaryEarnings.saved")}><h3 className="font-medium">{t("salaryEarnings.saved")}</h3>
        {earnings.data.length === 0 ? <p>{t("salaryEarnings.empty")}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th scope="col" className="py-3 text-start">{t("salaryEarnings.period")}</th><th scope="col" className="py-3 text-start">{t("salaryEarnings.amount")}</th><th scope="col" className="py-3 text-start">{t("salaryEarnings.remaining")}</th><th scope="col" className="py-3 text-start">{t("salaryEarnings.allocations")}</th></tr></thead><tbody>{earnings.data.map(row => <tr key={row.earning.id} className="border-b"><th scope="row" className="py-3 text-start font-normal"><bdi dir="ltr">{row.earning.periodStart} / {row.earning.periodEnd}</bdi></th><td className="px-2 py-3"><MoneyValue exact value={row.earning.approvedAmount} currencyLabel={t("common.currency")} /></td><td className="py-3"><MoneyValue exact value={row.remainingAmount} currencyLabel={t("common.currency")} /></td><td className="py-3"><ul>{row.earning.segments.map(segment => <li key={segment.id}>{projects.find(project => project.id === segment.projectId)?.name ?? segment.projectId}: <MoneyValue exact value={segment.amount} currencyLabel={t("common.currency")} />{segment.days === undefined ? null : ` · ${segment.days} ${t("salaryAllocations.daysUnit")}`}</li>)}<li>{t("salaryEarnings.unallocated")}: <MoneyValue exact value={row.earning.unallocatedAmount} currencyLabel={t("common.currency")} /></li></ul></td></tr>)}</tbody></table></div>}
      </section>}
    </div>}
    {projects.length > 0 && <section className="space-y-3 border-t pt-5"><label className="block max-w-md space-y-2 text-sm">{t("salaryEarnings.project")}<select className="min-h-11 w-full rounded-md border border-input bg-background px-3" value={selectedProject?.id ?? ""} onChange={event => setProjectId(event.target.value)}><option value="">{t("salaryEarnings.chooseProject")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      {selectedProject && (cost.isPending ? <p role="status">{t("common.loading")}</p> : cost.isError ? <p role="alert">{t("salaryEarnings.projectError")}</p> : cost.data && <div className="flex flex-wrap gap-3"><span>{t("salaryEarnings.projectCost")}</span><MoneyValue exact aggregate value={cost.data.totalAmount} currencyLabel={t("common.currency")} /></div>)}
    </section>}
  </section>
}
