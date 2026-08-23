import type { FormEvent, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { type Role } from "@tuari/contracts"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CurrencyInput, FieldSection, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import {
  useSyncManagedProjectsMutation,
  useSyncManagedWarehousesMutation,
  useUpdateEmployeeMutation,
  useUpdateEmployeeWorkplaceMutation,
} from "@/features/app-shell/mock-dashboard"
import { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import { rpcClient } from "@/lib/orpc-client"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import type { EmployeeManagerOption } from "./employee-batch-row-card"
import {
  computeSaveFailureRollback,
  placementStateFromEmployee,
  type EmployeeSavePlan,
  type PlacementState,
} from "./employee-save-reconcile"
import type { EmployeeTableRow } from "./employee-table"
import { classifyWorkforceRole, isEmployeeRoleSelectable } from "./role-classification"

type FormState = {
  firstName: string
  lastName: string
  phone: string
  roleId: string
  status: EmployeeTableRow["status"]
  salaryAmountDzd: string
  salaryPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | ""
  occupation: string
  notes: string
}

type FormErrors = Partial<
  Record<keyof FormState | "managerId" | "projectId" | "warehouseId" | "workplaceType", string>
>

type SaveErrorKind = "nothingSaved" | "partialRolledBack" | "partialUnverified"

/** Profile fields shared by the table row and the wire `Employee` record. */
type EmployeeProfile = Pick<
  EmployeeTableRow,
  | "firstName"
  | "lastName"
  | "phone"
  | "roleId"
  | "status"
  | "salaryAmountDzd"
  | "salaryPeriod"
  | "occupation"
  | "notes"
>

type ManagedOption = {
  id: string
  label: string
  secondary: string
}

function createFormState(employee: EmployeeProfile): FormState {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    phone: employee.phone,
    roleId: employee.roleId,
    status: employee.status,
    salaryAmountDzd: employee.salaryAmountDzd == null ? "" : String(employee.salaryAmountDzd),
    salaryPeriod: employee.salaryPeriod ?? "",
    occupation: employee.occupation ?? "",
    notes: employee.notes ?? "",
  }
}

function parseSalaryAmount(value: string) {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return null
  }

  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : Number.NaN
}

/** Employee edit page with form fields. */
/**
 * @description Component
 */
export function EmployeeEditPage({
  currentManagedProjectIds,
  currentManagedWarehouseIds,
  employee,
  managerOptions,
  managedProjectOptions,
  managedWarehouseOptions,
  roles,
  warehouseOptions = [],
}: {
  currentManagedProjectIds: string[]
  currentManagedWarehouseIds: string[]
  employee: EmployeeTableRow
  managerOptions: EmployeeManagerOption[]
  managedProjectOptions: ManagedOption[]
  managedWarehouseOptions: ManagedOption[]
  roles: Role[]
  warehouseOptions?: Array<{ id: string; label: string }>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateEmployeeMutation = useUpdateEmployeeMutation()
  const updateEmployeeWorkplaceMutation = useUpdateEmployeeWorkplaceMutation()
  const syncManagedProjectsMutation = useSyncManagedProjectsMutation()
  const syncManagedWarehousesMutation = useSyncManagedWarehousesMutation()
  const [state, setState] = useState<FormState>(() => createFormState(employee))
  const [errors, setErrors] = useState<FormErrors>({})
  const [saveError, setSaveError] = useState<SaveErrorKind | null>(null)
  const [workerManagerId, setWorkerManagerId] = useState(employee.currentManagerId ?? "")
  const [workerProjectId, setWorkerProjectId] = useState(employee.currentProjectId ?? "")
  const [workerWarehouseId, setWorkerWarehouseId] = useState(employee.currentWarehouseId ?? "")
  const [workplaceType, setWorkplaceType] = useState<"NONE" | "PROJECT" | "WAREHOUSE">(() =>
    employee.currentProjectId ? "PROJECT" : employee.currentWarehouseId ? "WAREHOUSE" : "NONE",
  )
  const [selectedManagedProjectIds, setSelectedManagedProjectIds] = useState<string[]>(currentManagedProjectIds)
  const [selectedManagedWarehouseIds, setSelectedManagedWarehouseIds] = useState<string[]>(currentManagedWarehouseIds)
  const previousEmployeeIdRef = useRef(employee.id)
  // Guards against a second submit while a save or its rollback is in flight
  // (Enter-key submits can fire before the button's isPending disables it).
  const saveInFlightRef = useRef(false)

  useEffect(() => {
    if (previousEmployeeIdRef.current === employee.id) {
      return
    }

    previousEmployeeIdRef.current = employee.id
    setState(createFormState(employee))
    setErrors({})
    setWorkerManagerId(employee.currentManagerId ?? "")
    setWorkerProjectId(employee.currentProjectId ?? "")
    setWorkerWarehouseId(employee.currentWarehouseId ?? "")
    setWorkplaceType(employee.currentProjectId ? "PROJECT" : employee.currentWarehouseId ? "WAREHOUSE" : "NONE")
    setSelectedManagedProjectIds(currentManagedProjectIds)
    setSelectedManagedWarehouseIds(currentManagedWarehouseIds)
  }, [currentManagedProjectIds, currentManagedWarehouseIds, employee])

  const currentRoleKey = employee.roleKey
  const selectedRoleKey = useMemo(
    () => roles.find((role) => role.id === state.roleId)?.key ?? employee.roleKey,
    [employee.roleKey, roles, state.roleId],
  )
  const { isWorker, isProjectManager, isWarehouseManager } = classifyWorkforceRole(selectedRoleKey)
  const selectedManager = managerOptions.find((manager) => manager.id === workerManagerId) ?? null
  const workerProjectOptions = selectedManager?.projectOptions ?? []
  const statusOptions = [
    { value: "ACTIVE", label: t("status.active") },
    { value: "INACTIVE", label: t("status.inactive") },
    { value: "LEFT", label: t("status.left") },
  ] satisfies Array<{ value: EmployeeTableRow["status"]; label: string }>
  const salaryPeriodOptions = [
    { value: "DAILY", label: t("detailPages.salary.daily") },
    { value: "WEEKLY", label: t("detailPages.salary.weekly") },
    { value: "MONTHLY", label: t("detailPages.salary.monthly") },
  ] satisfies Array<{ value: "DAILY" | "WEEKLY" | "MONTHLY"; label: string }>
  const isSaving =
    updateEmployeeMutation.isPending ||
    updateEmployeeWorkplaceMutation.isPending ||
    syncManagedProjectsMutation.isPending ||
    syncManagedWarehousesMutation.isPending

  function updateRole(roleId: string) {
    const nextRoleKey = roles.find((role) => role.id === roleId)?.key ?? ""

    setState((current) => ({ ...current, roleId }))
    setErrors((current) => ({ ...current, roleId: undefined, managerId: undefined, projectId: undefined }))

    if (nextRoleKey !== "worker") {
      setWorkerManagerId("")
      setWorkerProjectId("")
    }
  }

  async function handleSaveAll() {
    setSaveError(null)

    const nextErrors: FormErrors = {}
    const salaryAmount = parseSalaryAmount(state.salaryAmountDzd)

    if (state.firstName.trim().length === 0) {
      nextErrors.firstName = t("detailPages.employee.editPage.validation.firstNameRequired")
    }

    if (state.lastName.trim().length === 0) {
      nextErrors.lastName = t("detailPages.employee.editPage.validation.lastNameRequired")
    }

    if (!/^0[5-7]\d{8}$/.test(state.phone.trim())) {
      nextErrors.phone = t("detailPages.employee.editPage.validation.phoneInvalid")
    }

    if (!state.roleId) {
      nextErrors.roleId = t("detailPages.employee.editPage.validation.roleRequired")
    }

    if (state.occupation.trim().length > 120) {
      nextErrors.occupation = t("detailPages.employee.editPage.validation.occupationTooLong")
    }

    if (Number.isNaN(salaryAmount)) {
      nextErrors.salaryAmountDzd = t("detailPages.employee.editPage.validation.salaryAmountInvalid")
    }

    if (salaryAmount !== null && !state.salaryPeriod) {
      nextErrors.salaryPeriod = t("detailPages.employee.editPage.validation.salaryPeriodRequired")
    }

    if (salaryAmount === null && state.salaryPeriod) {
      nextErrors.salaryAmountDzd = t("detailPages.employee.editPage.validation.salaryAmountRequired")
    }

    if (isWorker && state.status === "ACTIVE") {
      if (workplaceType === "PROJECT") {
        if (!workerManagerId) {
          nextErrors.managerId = t("detailPages.employee.editPage.validation.managerRequired")
        }

        if (!workerProjectId) {
          nextErrors.projectId = t("detailPages.employee.editPage.validation.projectRequired")
        }
      } else if (workplaceType === "WAREHOUSE") {
        if (!workerWarehouseId) {
          nextErrors.warehouseId = t("detailPages.employee.editPage.validation.warehouseRequired")
        }
      } else {
        nextErrors.workplaceType = t("detailPages.employee.editPage.validation.workplaceRequired")
      }
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const workplaceChanged =
      workplaceType !==
        (employee.currentProjectId ? "PROJECT" : employee.currentWarehouseId ? "WAREHOUSE" : "NONE") ||
      workerManagerId !== (employee.currentManagerId ?? "") ||
      workerProjectId !== (employee.currentProjectId ?? "") ||
      workerWarehouseId !== (employee.currentWarehouseId ?? "") ||
      currentRoleKey !== selectedRoleKey ||
      state.status !== employee.status

    const managedProjectsChanged =
      selectedManagedProjectIds.length !== currentManagedProjectIds.length ||
      selectedManagedProjectIds.some((id) => !currentManagedProjectIds.includes(id)) ||
      currentRoleKey !== selectedRoleKey ||
      state.status !== employee.status

    const managedWarehousesChanged =
      selectedManagedWarehouseIds.length !== currentManagedWarehouseIds.length ||
      selectedManagedWarehouseIds.some((id) => !currentManagedWarehouseIds.includes(id)) ||
      currentRoleKey !== selectedRoleKey ||
      state.status !== employee.status

    const requiresBlockedTransition =
      (currentRoleKey === "worker" &&
        (selectedRoleKey !== "worker" || state.status !== "ACTIVE") &&
        (employee.currentManagerId || employee.currentProjectId || employee.currentWarehouseId)) ||
      (currentRoleKey === "project_manager" &&
        (selectedRoleKey !== "project_manager" || state.status !== "ACTIVE") &&
        currentManagedProjectIds.length > 0) ||
      (currentRoleKey === "warehouse_manager" &&
        (selectedRoleKey !== "warehouse_manager" || state.status !== "ACTIVE") &&
        currentManagedWarehouseIds.length > 0)

    if (requiresBlockedTransition) {
      setErrors((current) => ({
        ...current,
        roleId: t("detailPages.employee.editPage.validation.blockedTransition"),
      }))
      return
    }

    const preSavePlacement = placementStateFromEmployee(employee)
    const preSaveManagedProjectIds = currentManagedProjectIds
    const preSaveManagedWarehouseIds = currentManagedWarehouseIds

    const savePlan: EmployeeSavePlan = {
      workplace:
        isWorker && state.status === "ACTIVE" && workplaceChanged
          ? {
              managerId: workplaceType === "PROJECT" ? workerManagerId || null : null,
              nextType: workplaceType,
              projectId: workplaceType === "PROJECT" ? workerProjectId || null : null,
              warehouseId: workplaceType === "WAREHOUSE" ? workerWarehouseId || null : null,
            }
          : null,
      managedProjects: isProjectManager && state.status === "ACTIVE" && managedProjectsChanged ? { nextIds: selectedManagedProjectIds } : null,
      managedWarehouses: isWarehouseManager && state.status === "ACTIVE" && managedWarehousesChanged ? { nextIds: selectedManagedWarehouseIds } : null,
    }

    // Sequential mutations: an earlier success persists even if a later step
    // fails. The rollback below reconciles the page to what actually persisted.
    let profilePersisted = false
    const succeededSteps: Array<"workplace" | "managedProjects" | "managedWarehouses"> = []

    try {
      await updateEmployeeMutation.mutateAsync({
        id: employee.id,
        firstName: state.firstName.trim(),
        lastName: state.lastName.trim(),
        phone: state.phone.trim(),
        roleId: state.roleId,
        status: state.status,
        salaryAmountDzd: salaryAmount,
        salaryPeriod: state.salaryPeriod || null,
        occupation: state.occupation.trim() || null,
        notes: state.notes.trim() || null,
      })
      profilePersisted = true

      if (savePlan.workplace) {
        await updateEmployeeWorkplaceMutation.mutateAsync({
          employeeId: employee.id,
          ...savePlan.workplace,
        })
        succeededSteps.push("workplace")
      }

      if (savePlan.managedProjects) {
        await syncManagedProjectsMutation.mutateAsync({
          currentIds: currentManagedProjectIds,
          employeeId: employee.id,
          nextIds: savePlan.managedProjects.nextIds,
        })
        succeededSteps.push("managedProjects")
      }

      if (savePlan.managedWarehouses) {
        await syncManagedWarehousesMutation.mutateAsync({
          currentIds: currentManagedWarehouseIds,
          employeeId: employee.id,
          nextIds: savePlan.managedWarehouses.nextIds,
        })
        succeededSteps.push("managedWarehouses")
      }
    } catch {
      await reconcileAfterPartialSaveFailure(savePlan, {
        profilePersisted,
        succeededSteps,
        preSavePlacement,
        preSaveManagedProjectIds,
        preSaveManagedWarehouseIds,
      })
      return
    }

    void navigateToWorkspaceRoute(navigate, workspaceRoutes.employeeDetails(employee.id))
  }

  async function reconcileAfterPartialSaveFailure(
    savePlan: EmployeeSavePlan,
    context: {
      profilePersisted: boolean
      succeededSteps: Array<"workplace" | "managedProjects" | "managedWarehouses">
      preSavePlacement: PlacementState
      preSaveManagedProjectIds: string[]
      preSaveManagedWarehouseIds: string[]
    },
  ) {
    if (!context.profilePersisted) {
      // The profile mutation itself failed: nothing persisted, so keep the typed
      // form and let the user fix the data and retry.
      setSaveError("nothingSaved")
      return
    }

    // A later mutation failed: restore the placement / managed-scope controls to
    // exactly what the server holds (submitted values for steps that succeeded,
    // pre-save values for steps that failed or never ran).
    const rollback = computeSaveFailureRollback({
      plan: savePlan,
      succeededSteps: context.succeededSteps,
      preSavePlacement: context.preSavePlacement,
      preSaveManagedProjectIds: context.preSaveManagedProjectIds,
      preSaveManagedWarehouseIds: context.preSaveManagedWarehouseIds,
    })

    setWorkerManagerId(rollback.placement.workerManagerId)
    setWorkerProjectId(rollback.placement.workerProjectId)
    setWorkerWarehouseId(rollback.placement.workerWarehouseId)
    setWorkplaceType(rollback.placement.workplaceType)
    setSelectedManagedProjectIds(rollback.managedProjectIds)
    setSelectedManagedWarehouseIds(rollback.managedWarehouseIds)
    setErrors({})

    // Profile fields persisted: re-fetch the authoritative record and reconcile.
    try {
      const result = await rpcClient.employeesGet({ id: employee.id })

      if (!result.success) {
        throw new Error(result.error.message)
      }

      setState(createFormState(result.item))
      setSaveError("partialRolledBack")
    } catch {
      setSaveError("partialUnverified")
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saveInFlightRef.current) {
      return
    }

    saveInFlightRef.current = true
    void handleSaveAll().finally(() => {
      saveInFlightRef.current = false
    })
  }

  return (
    <Surface variant="panel">
      <form onSubmit={handleSubmit}>
        <PageSurfaceContent>
        <PageHeader
          action={
            <PageActionGroup>
              <Button type="button" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.employeeDetails(employee.id))}>
                {t("detailPages.employee.editPage.backToRecord")}
              </Button>
              <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.employees())}>
                {t("detailPages.employee.back")}
              </Button>
            </PageActionGroup>
          }
          description={t("detailPages.employee.editPage.description")}
          title={`${t("detailPages.employee.editTitle")} ${employee.name}`}
        />

        {saveError ? (
          <div
            aria-live="assertive"
            className="flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"
            role="alert"
          >
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <p>
              {saveError === "nothingSaved" ? t("detailPages.employee.editPage.saveNothingSaved") : null}
              {saveError === "partialRolledBack" ? t("detailPages.employee.editPage.savePartialRolledBack") : null}
              {saveError === "partialUnverified" ? t("detailPages.employee.editPage.savePartialUnverified") : null}
            </p>
          </div>
        ) : null}

        <FieldSection
          description={t("detailPages.employee.editPage.personalDescription")}
          title={t("detailPages.employee.editPage.personalTitle")}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label={t("detailPages.employee.editPage.firstName")} error={errors.firstName}>
              <Input value={state.firstName} onChange={(event) => setState({ ...state, firstName: event.target.value })} />
            </Field>
            <Field label={t("detailPages.employee.editPage.lastName")} error={errors.lastName}>
              <Input value={state.lastName} onChange={(event) => setState({ ...state, lastName: event.target.value })} />
            </Field>
            <Field label={t("detailPages.employee.phone")} error={errors.phone}>
              <Input dir="ltr" inputMode="tel" value={state.phone} onChange={(event) => setState({ ...state, phone: event.target.value })} />
            </Field>
            <Field label={t("detailPages.employee.role")} error={errors.roleId}>
              <NativeSelect value={state.roleId} onChange={(event) => updateRole(event.target.value)}>
                {roles.filter((role) => isEmployeeRoleSelectable(role.key)).map((role) => (
                  <option key={role.id} disabled={currentRoleKey !== "worker" && role.key === "worker"} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </NativeSelect>
              {currentRoleKey !== "worker" ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("detailPages.employee.editPage.roleWorkerHint")}
                </p>
              ) : null}
            </Field>
            <Field label={t("detailPages.employee.editPage.occupation")} error={errors.occupation}>
              <Input
                placeholder={t("detailPages.employee.editPage.occupationPlaceholder")}
                value={state.occupation}
                onChange={(event) => setState({ ...state, occupation: event.target.value })}
              />
            </Field>
            <Field label={t("detailPages.employee.editPage.status")} error={errors.status}>
              <NativeSelect
                value={state.status}
                onChange={(event) => setState({ ...state, status: event.target.value as EmployeeTableRow["status"] })}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("detailPages.employee.editPage.notes")} error={errors.notes} className="md:col-span-2 xl:col-span-1">
              <Textarea value={state.notes} onChange={(event) => setState({ ...state, notes: event.target.value })} />
            </Field>
          </div>
        </FieldSection>

        <FieldSection
          description={t("detailPages.employee.editPage.workDescription")}
          title={t("detailPages.employee.editPage.workTitle")}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {isWorker ? (
              <>
                <Field label={t("detailPages.employee.editPage.workplaceType")} error={errors.workplaceType} className="md:col-span-2 xl:col-span-3">
                  <NativeSelect
                    value={workplaceType}
                    onChange={(event) => {
                      const next = event.target.value as "NONE" | "PROJECT" | "WAREHOUSE"
                      setWorkplaceType(next)
                      if (next === "PROJECT") {
                        setWorkerWarehouseId("")
                      }
                      if (next === "WAREHOUSE") {
                        setWorkerManagerId("")
                        setWorkerProjectId("")
                      }
                      if (next === "NONE") {
                        setWorkerManagerId("")
                        setWorkerProjectId("")
                        setWorkerWarehouseId("")
                      }
                    }}
                  >
                    <option value="NONE">{t("detailPages.employee.editPage.noWorkplace")}</option>
                    <option value="PROJECT">{t("detailPages.employee.editPage.projectPlacement")}</option>
                    <option value="WAREHOUSE">{t("detailPages.employee.editPage.warehousePlacement")}</option>
                  </NativeSelect>
                </Field>

                {workplaceType === "PROJECT" ? (
                  <>
                    <Field label={t("detailPages.employee.editPage.directManager")} error={errors.managerId}>
                      <NativeSelect
                        value={workerManagerId}
                        onChange={(event) => {
                          setWorkerManagerId(event.target.value)
                          setWorkerProjectId("")
                        }}
                      >
                        <option value="">{t("detailPages.employee.editPage.selectProjectManager")}</option>
                        {managerOptions.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label={t("detailPages.employee.editPage.currentProject")} error={errors.projectId}>
                      <NativeSelect disabled={!workerManagerId} value={workerProjectId} onChange={(event) => setWorkerProjectId(event.target.value)}>
                        <option value="">{t("detailPages.employee.editPage.selectManagerProject")}</option>
                        {workerProjectOptions.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </>
                ) : null}

                {workplaceType === "WAREHOUSE" ? (
                  <Field label={t("detailPages.employee.editPage.warehouse")} error={errors.warehouseId} className="md:col-span-2 xl:col-span-3">
                    <NativeSelect value={workerWarehouseId} onChange={(event) => setWorkerWarehouseId(event.target.value)}>
                      <option value="">{t("detailPages.employee.editPage.selectWarehouse")}</option>
                      {warehouseOptions.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>

          {isProjectManager ? (
            <ManagedScopeSection
              description={t("detailPages.employee.editPage.managedProjectsDescription")}
              items={managedProjectOptions}
              selectedIds={selectedManagedProjectIds}
              title={t("detailPages.employee.editPage.managedProjectsTitle")}
              onToggle={(projectId) =>
                setSelectedManagedProjectIds((current) =>
                  current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
                )
              }
            />
          ) : null}

          {isWarehouseManager ? (
            <ManagedScopeSection
              description={t("detailPages.employee.editPage.managedWarehousesDescription")}
              items={managedWarehouseOptions}
              selectedIds={selectedManagedWarehouseIds}
              title={t("detailPages.employee.editPage.managedWarehousesTitle")}
              onToggle={(warehouseId) =>
                setSelectedManagedWarehouseIds((current) =>
                  current.includes(warehouseId) ? current.filter((id) => id !== warehouseId) : [...current, warehouseId],
                )
              }
            />
          ) : null}
        </FieldSection>

        <FieldSection
          description={t("detailPages.employee.editPage.salaryDescription")}
          title={t("detailPages.employee.editPage.salaryTitle")}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label={t("detailPages.employee.editPage.salaryAmount")} error={errors.salaryAmountDzd}>
              <CurrencyInput
                currencyLabel="دج"
                placeholder="10000"
                value={state.salaryAmountDzd}
                onChange={(event) => setState({ ...state, salaryAmountDzd: event.target.value })}
              />
            </Field>
            <Field label={t("detailPages.employee.editPage.salaryPeriod")} error={errors.salaryPeriod}>
              <NativeSelect
                value={state.salaryPeriod}
                onChange={(event) =>
                  setState({
                    ...state,
                    salaryPeriod: event.target.value as FormState["salaryPeriod"],
                  })
                }
              >
                <option value="">{t("detailPages.employee.editPage.selectSalaryPeriod")}</option>
                {salaryPeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </FieldSection>

        <PageFooterActions>
          <Button type="button" variant="outline" onClick={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.employeeDetails(employee.id))}>
            {t("common.cancel")}
          </Button>
          <Button disabled={isSaving} type="submit">
            {t("detailPages.employee.editPage.saveAll")}
          </Button>
        </PageFooterActions>
        </PageSurfaceContent>
      </form>
    </Surface>
  )
}

function ManagedScopeSection({
  description,
  items,
  selectedIds,
  title,
  onToggle,
}: {
  description: string
  items: ManagedOption[]
  selectedIds: string[]
  title: string
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-sidebar p-4 md:col-span-2 xl:col-span-3">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const checked = selectedIds.includes(item.id)

          return (
            <label
              key={item.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${checked ? "border-primary/60 bg-primary/8" : "border-border/70 bg-sidebar dark:bg-background/70"}`}
            >
              <input
                checked={checked}
                className="mt-1 size-4 accent-primary"
                type="checkbox"
                onChange={() => onToggle(item.id)}
              />
              <span className="space-y-1">
                <span className="block font-medium text-foreground">{item.label}</span>
                <span className="block text-sm text-muted-foreground">{item.secondary}</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`flex flex-col gap-2 ${className ?? ""}`.trim()}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </label>
  )
}
