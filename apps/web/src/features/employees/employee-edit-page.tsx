import type { FormEvent, ReactElement } from "react"
import { EmployeeEditForm, type FormState, type FormErrors, type ManagedOption } from "./employee-edit-form"
import { useEffect, useMemo, useRef, useState } from "react"
import { type Role } from "@tuari/contracts"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useSaveEmployeeMutation } from "@/features/app-shell/mock-dashboard"
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import type { EmployeeManagerOption } from "./employee-batch-row-card"
import type { EmployeeSavePlan } from "./employee-save-reconcile"
import type { EmployeeTableRow } from "./employee-table"
import { classifyWorkforceRole } from "./role-classification"
import { ExactEmployeeEditPage as ExactEmployeeEdit } from "./exact-employee-pages"
import type { ExactEmployeePageProps } from "./exact-employee-pages"

/** A rejected batch is atomic (nothing persisted), so "nothingSaved" is the only save-error state. */
type SaveErrorKind = "nothingSaved"

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
function NumericEmployeeEditPage({
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
  const saveEmployeeMutation = useSaveEmployeeMutation()
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
  // Relationship fields are only submitted when the user actually edited them
  // (PR #51 review). An untouched control holds a load-time snapshot; sending it
  // would let a stale page revert newer concurrent relationship changes.
  const [placementDirty, setPlacementDirty] = useState(false)
  const [managedProjectsDirty, setManagedProjectsDirty] = useState(false)
  const [managedWarehousesDirty, setManagedWarehousesDirty] = useState(false)
  const previousEmployeeIdRef = useRef(employee.id)
  // Guards against a second submit while a save is in flight
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
    setPlacementDirty(false)
    setManagedProjectsDirty(false)
    setManagedWarehousesDirty(false)
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
  // Periods offered: daily and monthly only. WEEKLY stays in the enum and
  // still renders for legacy employees, but it is not a new selection here.
  const salaryPeriodOptions: Array<{ value: "DAILY" | "WEEKLY" | "MONTHLY"; label: string }> = [
    { value: "DAILY", label: t("detailPages.salary.daily") },
    { value: "MONTHLY", label: t("detailPages.salary.monthly") },
  ]
  if (employee.salaryPeriod === "WEEKLY") {
    salaryPeriodOptions.push({ value: "WEEKLY", label: t("detailPages.salary.weekly") })
  }
  const isSaving = saveEmployeeMutation.isPending

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

    // An ACTIVE worker with no placement at all must still satisfy the #20
    // requirement on every save; omitting an untouched NONE would otherwise
    // sneak an unplaced active worker through. Workers who already have a
    // placement only submit it when the user edited the controls.
    const workerNeedsPlacement = !employee.currentManagerId && !employee.currentProjectId && !employee.currentWarehouseId

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

    if (isWorker && state.status === "ACTIVE" && (placementDirty || workerNeedsPlacement)) {
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

    const includeWorkplace = isWorker && state.status === "ACTIVE" && (placementDirty || workerNeedsPlacement)
    const includeManagedProjects = managedProjectsDirty && isProjectManager && state.status === "ACTIVE"
    const includeManagedWarehouses = managedWarehousesDirty && isWarehouseManager && state.status === "ACTIVE"

    const savePlan: EmployeeSavePlan = {
      workplace:
        includeWorkplace
          ? {
              managerId: workplaceType === "PROJECT" ? workerManagerId || null : null,
              nextType: workplaceType,
              projectId: workplaceType === "PROJECT" ? workerProjectId || null : null,
              warehouseId: workplaceType === "WAREHOUSE" ? workerWarehouseId || null : null,
            }
          : null,
      managedProjects: includeManagedProjects ? { nextIds: selectedManagedProjectIds } : null,
      managedWarehouses: includeManagedWarehouses ? { nextIds: selectedManagedWarehouseIds } : null,
    }

    // The server owns the transaction and rolls the whole batch back on failure.
    try {
      await saveEmployeeMutation.mutateAsync({
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
        ...(savePlan.workplace ? { placement: savePlan.workplace } : {}),
        ...(savePlan.managedProjects ? { managedProjectIds: savePlan.managedProjects.nextIds } : {}),
        ...(savePlan.managedWarehouses ? { managedWarehouseIds: savePlan.managedWarehouses.nextIds } : {}),
      })
    } catch {
      // A rejected batch means nothing persisted (the server transaction is
      // all-or-nothing), so keep every typed value and let the user retry.
      setSaveError("nothingSaved")
      return
    }

    void navigateToWorkspaceRoute(navigate, workspaceRoutes.employeeDetails(employee.id))
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

  return <EmployeeEditForm
    employee={employee} state={state} setState={setState} errors={errors}
    saveError={saveError === "nothingSaved" ? t("detailPages.employee.editPage.saveNothingSaved") : null}
    isSaving={isSaving} onSubmit={handleSubmit}
    onBackToRecord={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.employeeDetails(employee.id))}
    onBackToEmployees={() => void navigateToWorkspaceRoute(navigate, workspaceRoutes.employees())}
    roles={roles} currentRoleKey={currentRoleKey} updateRole={updateRole}
    isWorker={isWorker} isProjectManager={isProjectManager} isWarehouseManager={isWarehouseManager}
    statusOptions={statusOptions} salaryPeriodOptions={salaryPeriodOptions}
    workplaceType={workplaceType} setWorkplaceType={setWorkplaceType}
    workerManagerId={workerManagerId} setWorkerManagerId={setWorkerManagerId}
    workerProjectId={workerProjectId} setWorkerProjectId={setWorkerProjectId}
    workerWarehouseId={workerWarehouseId} setWorkerWarehouseId={setWorkerWarehouseId}
    setPlacementDirty={setPlacementDirty} managerOptions={managerOptions} workerProjectOptions={workerProjectOptions}
    warehouseOptions={warehouseOptions} managedProjectOptions={managedProjectOptions} managedWarehouseOptions={managedWarehouseOptions}
    selectedManagedProjectIds={selectedManagedProjectIds} setSelectedManagedProjectIds={setSelectedManagedProjectIds}
    selectedManagedWarehouseIds={selectedManagedWarehouseIds} setSelectedManagedWarehouseIds={setSelectedManagedWarehouseIds}
    setManagedProjectsDirty={setManagedProjectsDirty} setManagedWarehousesDirty={setManagedWarehousesDirty}
  />
}

type NumericEmployeeEditProps = Parameters<typeof NumericEmployeeEditPage>[0]
export function EmployeeEditPage(props: { mode: "exact" } & ExactEmployeePageProps): ReactElement
export function EmployeeEditPage(props: NumericEmployeeEditProps & { mode?: "numeric" }): ReactElement
export function EmployeeEditPage(props: ({ mode: "exact" } & ExactEmployeePageProps) | (NumericEmployeeEditProps & { mode?: "numeric" })) {
  if (props.mode === "exact") {
    return <ExactEmployeeEdit {...props} />
  }
  return <NumericEmployeeEditPage {...props} />
}
