import type { FormEvent, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { type Role } from "@tuari/contracts"
import { useNavigate } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

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
import { navigateToWorkspaceRoute, workspaceRoutes } from "@/router/navigation"

import type { EmployeeManagerOption } from "./employee-batch-row-card"
import type { EmployeeTableRow } from "./employee-table"

type FormState = {
  firstName: string
  lastName: string
  phone: string
  roleId: string
  status: EmployeeTableRow["status"]
  salaryAmountDzd: string
  salaryPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | ""
  notes: string
}

type FormErrors = Partial<
  Record<keyof FormState | "managerId" | "projectId", string>
>

type ManagedOption = {
  id: string
  label: string
  secondary: string
}

function createFormState(employee: EmployeeTableRow): FormState {
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    phone: employee.phone,
    roleId: employee.roleId,
    status: employee.status,
    salaryAmountDzd: employee.salaryAmountDzd == null ? "" : String(employee.salaryAmountDzd),
    salaryPeriod: employee.salaryPeriod ?? "",
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

export function EmployeeEditPage({
  currentManagedProjectIds,
  currentManagedWarehouseIds,
  employee,
  managerOptions,
  managedProjectOptions,
  managedWarehouseOptions,
  roles,
}: {
  currentManagedProjectIds: string[]
  currentManagedWarehouseIds: string[]
  employee: EmployeeTableRow
  managerOptions: EmployeeManagerOption[]
  managedProjectOptions: ManagedOption[]
  managedWarehouseOptions: ManagedOption[]
  roles: Role[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateEmployeeMutation = useUpdateEmployeeMutation()
  const updateEmployeeWorkplaceMutation = useUpdateEmployeeWorkplaceMutation()
  const syncManagedProjectsMutation = useSyncManagedProjectsMutation()
  const syncManagedWarehousesMutation = useSyncManagedWarehousesMutation()
  const [state, setState] = useState<FormState>(() => createFormState(employee))
  const [errors, setErrors] = useState<FormErrors>({})
  const [workerManagerId, setWorkerManagerId] = useState(employee.currentManagerId ?? "")
  const [workerProjectId, setWorkerProjectId] = useState(employee.currentProjectId ?? "")
  const [selectedManagedProjectIds, setSelectedManagedProjectIds] = useState<string[]>(currentManagedProjectIds)
  const [selectedManagedWarehouseIds, setSelectedManagedWarehouseIds] = useState<string[]>(currentManagedWarehouseIds)
  const previousEmployeeIdRef = useRef(employee.id)

  useEffect(() => {
    if (previousEmployeeIdRef.current === employee.id) {
      return
    }

    previousEmployeeIdRef.current = employee.id
    setState(createFormState(employee))
    setErrors({})
    setWorkerManagerId(employee.currentManagerId ?? "")
    setWorkerProjectId(employee.currentProjectId ?? "")
    setSelectedManagedProjectIds(currentManagedProjectIds)
    setSelectedManagedWarehouseIds(currentManagedWarehouseIds)
  }, [currentManagedProjectIds, currentManagedWarehouseIds, employee])

  const currentRoleKey = employee.roleKey
  const selectedRoleKey = useMemo(
    () => roles.find((role) => role.id === state.roleId)?.key ?? employee.roleKey,
    [employee.roleKey, roles, state.roleId],
  )
  const isWorker = selectedRoleKey === "worker"
  const isProjectManager = selectedRoleKey === "project_manager"
  const isWarehouseManager = selectedRoleKey === "warehouse_manager"
  const hasWarehouseWorkerPlacement = isWorker && Boolean(employee.currentWarehouseId)
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

    if (Number.isNaN(salaryAmount)) {
      nextErrors.salaryAmountDzd = t("detailPages.employee.editPage.validation.salaryAmountInvalid")
    }

    if (salaryAmount !== null && !state.salaryPeriod) {
      nextErrors.salaryPeriod = t("detailPages.employee.editPage.validation.salaryPeriodRequired")
    }

    if (salaryAmount === null && state.salaryPeriod) {
      nextErrors.salaryAmountDzd = t("detailPages.employee.editPage.validation.salaryAmountRequired")
    }

    if (isWorker && state.status === "ACTIVE" && !hasWarehouseWorkerPlacement) {
      if (!workerManagerId) {
        nextErrors.managerId = t("detailPages.employee.editPage.validation.managerRequired")
      }

      if (!workerProjectId) {
        nextErrors.projectId = t("detailPages.employee.editPage.validation.projectRequired")
      }
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    const workerPlacementChanged =
      workerManagerId !== (employee.currentManagerId ?? "") ||
      workerProjectId !== (employee.currentProjectId ?? "") ||
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

    await updateEmployeeMutation.mutateAsync({
      id: employee.id,
      firstName: state.firstName.trim(),
      lastName: state.lastName.trim(),
      phone: state.phone.trim(),
      roleId: state.roleId,
      status: state.status,
      salaryAmountDzd: salaryAmount,
      salaryPeriod: state.salaryPeriod || null,
      notes: state.notes.trim() || null,
    })

    if (isWorker && state.status === "ACTIVE" && !hasWarehouseWorkerPlacement && workerPlacementChanged) {
      await updateEmployeeWorkplaceMutation.mutateAsync({
        employeeId: employee.id,
        managerId: workerManagerId || null,
        nextType: "PROJECT",
        projectId: workerProjectId || null,
        warehouseId: null,
      })
    }

    if (isProjectManager && state.status === "ACTIVE" && managedProjectsChanged) {
      await syncManagedProjectsMutation.mutateAsync({
        currentIds: currentManagedProjectIds,
        employeeId: employee.id,
        nextIds: selectedManagedProjectIds,
      })
    }

    if (isWarehouseManager && state.status === "ACTIVE" && managedWarehousesChanged) {
      await syncManagedWarehousesMutation.mutateAsync({
        currentIds: currentManagedWarehouseIds,
        employeeId: employee.id,
        nextIds: selectedManagedWarehouseIds,
      })
    }

    void navigateToWorkspaceRoute(navigate, workspaceRoutes.employeeDetails(employee.id))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSaveAll()
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
                {roles.map((role) => (
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
            {isWorker && !hasWarehouseWorkerPlacement ? (
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

            {hasWarehouseWorkerPlacement ? (
              <div className="md:col-span-2 xl:col-span-3 rounded-[18px] border border-border/60 bg-sidebar/90 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                {t("detailPages.employee.editPage.warehousePlacementNotice")}
              </div>
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
    <div className="space-y-4 rounded-lg border border-border/60 bg-sidebar p-4 shadow-sm md:col-span-2 xl:col-span-3">
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
              className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 transition ${checked ? "border-primary/60 bg-primary/8" : "border-border/70 bg-sidebar dark:bg-background/70"}`}
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
