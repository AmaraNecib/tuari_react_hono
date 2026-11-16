import { useCallback, useEffect, useMemo, useState } from "react"
import { useBlocker } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { exactSalaryEarningStatusSchema, exactProjectSalaryCostSchema, type ExactEmployee, type ExactWorkforceEarningsClient } from "@tuari/contracts"
import { Field } from "@/components/ui/field"
import { NativeSelect } from "@/components/ui/form-controls"
import { Button } from "@/components/ui/button"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { useSessionQuery } from "@/features/session/use-session-query"
import { WorkspaceLink } from "@/router/navigation"
import { MoneyValue } from "@/features/shared/money-value"
import { PageHeader, Surface, SurfaceHeader } from "@/features/shared/page-primitives"
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
  const { t, i18n } = useTranslation()
  const session = useSessionQuery()
  const scopeValid = session.data?.user?.id === userId
  const recovery = useMemo(() => {
    try { return { record: browserMonthlyApprovalStore(workspaceId, userId).load(), error: null as string | null } }
    catch (error) { return { record: null, error: error instanceof Error ? error.message : "Monthly approval recovery is unreadable" } }
  }, [workspaceId, userId])
  const [confirmedRecoveryRecord, setConfirmedRecoveryRecord] = useState<typeof recovery.record>(null)
  const recoveredRecord = recovery.record === confirmedRecoveryRecord ? null : recovery.record
  const [employeeId, setEmployeeId] = useState(() => recovery.record?.employeeId ?? "")
  const [projectId, setProjectId] = useState("")
  const [approvalState, setApprovalState] = useState<SalaryApprovalState>(() => recovery.record || recovery.error ? "uncertain" : "idle")
  const pending = approvalState === "pending" || approvalState === "uncertain"
  const blocked = !scopeValid || recovery.error !== null || recoveredRecord !== null || pending
  const handleApprovalState = useCallback((state: SalaryApprovalState) => {
    if (state === "approved") setConfirmedRecoveryRecord(recovery.record)
    setApprovalState(state)
    onPendingCommandChange(state === "pending" || state === "uncertain")
  }, [onPendingCommandChange, recovery.record])
  useEffect(() => { onPendingCommandChange(blocked) }, [blocked, onPendingCommandChange])
  const blocker = useBlocker({ shouldBlockFn: () => blocked, enableBeforeUnload: blocked, withResolver: true })
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
  return <main dir={i18n.dir()} className="mx-auto w-full max-w-6xl space-y-6 px-3 py-5 sm:px-6 lg:py-8" aria-label={t("salaryEarnings.title")}>
    <PageHeader title={t("salaryEarnings.title")} description={t("salaryEarnings.description")} />
    {(pending || recovery.error || recoveredRecord) && <Surface variant={recovery.error ? "panel" : "subtle"} role={recovery.error ? "alert" : "status"} className="space-y-3 p-4 sm:p-5">
      <SurfaceHeader title={recovery.error ? t("salaryEarnings.recoveryUnreadable") : t("salaryEarnings.pendingTitle")} description={recovery.error ? t("salaryEarnings.recoveryUnreadableHelp") : approvalState === "pending" ? t("salaryEarnings.pending") : t("salaryEarnings.recoveryHelp")} />
      {recoveredRecord && <p className="text-sm text-ink-2">{t("salaryEarnings.recoveryRetryHelp")}</p>}
    </Surface>}
    {blocker.status === "blocked" && <Surface as="section" role="alert" aria-labelledby="salary-navigation-title" aria-describedby="salary-navigation-description" className="space-y-3 p-4 sm:p-5">
      <h2 id="salary-navigation-title" className="text-sm font-semibold text-ink">{t("salaryEarnings.navigationTitle")}</h2>
      <p id="salary-navigation-description" className="text-sm text-ink-2">{t("salaryEarnings.navigationHelp")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => blocker.reset()}>{t("salaryEarnings.stay")}</Button>
        <Button type="button" onClick={() => blocker.proceed()}>{t("salaryEarnings.leaveAndRecover")}</Button>
      </div>
    </Surface>}
    {!scopeValid && <p role="alert" className="text-sm text-destructive">{t("salaryEarnings.error")}</p>}
    {employees.length === 0 ? <Surface className="space-y-3 p-5"><p>{t("salaryEarnings.noEmployees")}</p><WorkspaceLink target={{ to: "/employees/create" }}>{t("salaryEarnings.createEmployee")}</WorkspaceLink></Surface> : <Surface className="space-y-5 p-4 sm:p-6">
      <SurfaceHeader title={t("salaryEarnings.approvalSection")} description={t("salaryEarnings.cashUnavailable")} />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
        <div className="min-w-0 space-y-5">
          <Field label={t("salaryEarnings.employee")} className="max-w-lg">
            <NativeSelect disabled={blocked} value={selected?.id ?? ""} onChange={event => { if (!blocked) setEmployeeId(event.target.value) }}>
              <option value="">{t("salaryEarnings.chooseEmployee")}</option>
              {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
            </NativeSelect>
          </Field>
          {selected && <div className="min-w-0 space-y-5">
            {scopeValid && !recovery.error && (!earnings.isError || recoveredRecord !== null || pending || approvalState === "approved") && <ExactMonthlySalaryApprovalForm key={`${workspaceId}:${userId}:${selected.id}`} employeeId={selected.id} workspaceId={workspaceId} userId={userId} defaultMonth={defaultMonth} projects={projects} client={client} onAttemptStateChange={handleApprovalState} />}
            {earnings.isPending && <p role="status" className="text-sm text-ink-3">{t("salaryEarnings.loading")}</p>}
            {earnings.isError && <div role="alert" className="space-y-3"><p>{t("salaryEarnings.error")}</p><Button onClick={() => { void earnings.refetch() }}>{t("salaryEarnings.retry")}</Button></div>}
            {earnings.data !== undefined && <Surface variant="inset" className="min-w-0 space-y-4 p-4 sm:p-5" aria-label={t("salaryEarnings.saved")}>
              <SurfaceHeader title={t("salaryEarnings.saved")} description={t("salaryEarnings.savedHelp")} />
              {earnings.data.length === 0 ? <p className="text-sm text-ink-3">{t("salaryEarnings.empty")}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-sm"><thead><tr className="border-b border-line"><th scope="col" className="py-3 pe-3 text-start">{t("salaryEarnings.period")}</th><th scope="col" className="px-2 py-3 text-start">{t("salaryEarnings.amount")}</th><th scope="col" className="px-2 py-3 text-start">{t("salaryEarnings.remaining")}</th><th scope="col" className="py-3 ps-2 text-start">{t("salaryEarnings.allocations")}</th></tr></thead><tbody>{earnings.data.map(row => <tr key={row.earning.id} className="border-b border-line last:border-0"><th scope="row" className="py-3 pe-3 text-start font-normal"><bdi dir="ltr">{row.earning.periodStart} / {row.earning.periodEnd}</bdi></th><td className="px-2 py-3"><MoneyValue exact value={row.earning.approvedAmount} currencyLabel={t("common.currency")} /></td><td className="px-2 py-3"><MoneyValue exact value={row.remainingAmount} currencyLabel={t("common.currency")} /></td><td className="py-3 ps-2"><ul className="space-y-1">{row.earning.segments.map(segment => <li key={segment.id}>{projects.find(project => project.id === segment.projectId)?.name ?? segment.projectId}: <MoneyValue exact value={segment.amount} currencyLabel={t("common.currency")} />{segment.days === undefined ? null : ` · ${segment.days} ${t("salaryAllocations.daysUnit")}`}</li>)}<li>{t("salaryEarnings.unallocated")}: <MoneyValue exact value={row.earning.unallocatedAmount} currencyLabel={t("common.currency")} /></li></ul></td></tr>)}</tbody></table></div>}
            </Surface>}
          </div>}
        </div>
        {projects.length > 0 && <Surface variant="inset" className="h-fit min-w-0 space-y-4 p-4 sm:p-5">
          <SurfaceHeader title={t("salaryEarnings.projectReadback")} description={t("salaryEarnings.projectReadbackHelp")} />
          <Field label={t("salaryEarnings.project")}>
            <NativeSelect value={selectedProject?.id ?? ""} onChange={event => setProjectId(event.target.value)}><option value="">{t("salaryEarnings.chooseProject")}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</NativeSelect>
          </Field>
          {selectedProject && (cost.isPending ? <p role="status" className="text-sm text-ink-3">{t("common.loading")}</p> : cost.isError ? <p role="alert" className="text-sm text-destructive">{t("salaryEarnings.projectError")}</p> : cost.data && <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-4"><span className="text-sm font-medium">{t("salaryEarnings.projectCost")}</span><span className="text-lg font-semibold tabular-nums"><MoneyValue exact aggregate value={cost.data.totalAmount} currencyLabel={t("common.currency")} /></span></div>)}
        </Surface>}
      </div>
    </Surface>}
  </main>
}
