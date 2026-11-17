import type { Dispatch, SetStateAction, FormEvent, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { Role } from "@tuari/contracts"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CurrencyInput, FieldSection, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { PageActionGroup, PageFooterActions, PageHeader, PageSurfaceContent, Surface } from "@/features/shared/page-primitives"
import type { EmployeeManagerOption } from "./employee-batch-row-card"

import { isEmployeeRoleSelectable } from "./role-classification"

export type FormState = {
  firstName: string
  lastName: string
  phone: string
  roleId: string
  status: "ACTIVE" | "INACTIVE" | "LEFT"
  salaryAmountDzd: string
  salaryPeriod: "DAILY" | "WEEKLY" | "MONTHLY" | ""
  occupation: string
  notes: string
}

export type FormErrors = Partial<
  Record<keyof FormState | "managerId" | "projectId" | "warehouseId" | "workplaceType", string>
>

export type ManagedOption = {
  id: string
  label: string
  secondary: ReactNode
}

type Setter<T> = Dispatch<SetStateAction<T>>
export type EmployeeEditFormProps = {
  employee: { id: string; name: string }
  state: FormState
  setState: Setter<FormState>
  errors: FormErrors
  saveError: ReactNode
  isSaving: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onBackToRecord: () => void
  onBackToEmployees: () => void
  roles: Role[]
  currentRoleKey: string
  updateRole: (id: string) => void
  selectableRole?: (key: string) => boolean
  allowWorkerRoleChange?: boolean
  isWorker: boolean
  isProjectManager: boolean
  isWarehouseManager: boolean
  statusOptions: Array<{ value: FormState["status"]; label: string }>
  salaryPeriodOptions: Array<{ value: Exclude<FormState["salaryPeriod"], "">; label: string }>
  workplaceType: "NONE" | "PROJECT" | "WAREHOUSE"
  setWorkplaceType: Setter<"NONE" | "PROJECT" | "WAREHOUSE">
  workerManagerId: string
  setWorkerManagerId: Setter<string>
  workerProjectId: string
  setWorkerProjectId: Setter<string>
  workerWarehouseId: string
  setWorkerWarehouseId: Setter<string>
  setPlacementDirty: Setter<boolean>
  managerOptions: EmployeeManagerOption[]
  workerProjectOptions: Array<{ id: string; label: string }>
  warehouseOptions: Array<{ id: string; label: string }>
  managedProjectOptions: ManagedOption[]
  managedWarehouseOptions: ManagedOption[]
  selectedManagedProjectIds: string[]
  setSelectedManagedProjectIds: Setter<string[]>
  selectedManagedWarehouseIds: string[]
  setSelectedManagedWarehouseIds: Setter<string[]>
  setManagedProjectsDirty: Setter<boolean>
  setManagedWarehousesDirty: Setter<boolean>
}

/** The original employee edit presentation, shared by both data adapters. */
export function EmployeeEditForm({
  employee,
  state,
  setState,
  errors,
  saveError,
  isSaving,
  onSubmit,
  onBackToRecord,
  onBackToEmployees,
  roles,
  currentRoleKey,
  updateRole,
  selectableRole = isEmployeeRoleSelectable,
  allowWorkerRoleChange = false,
  isWorker,
  isProjectManager,
  isWarehouseManager,
  statusOptions,
  salaryPeriodOptions,
  workplaceType,
  setWorkplaceType,
  workerManagerId,
  setWorkerManagerId,
  workerProjectId,
  setWorkerProjectId,
  workerWarehouseId,
  setWorkerWarehouseId,
  setPlacementDirty,
  managerOptions,
  workerProjectOptions,
  warehouseOptions,
  managedProjectOptions,
  managedWarehouseOptions,
  selectedManagedProjectIds,
  setSelectedManagedProjectIds,
  selectedManagedWarehouseIds,
  setSelectedManagedWarehouseIds,
  setManagedProjectsDirty,
  setManagedWarehousesDirty
}: EmployeeEditFormProps) {
  const { t } = useTranslation()
  return (
    <Surface variant="panel">
      <form onSubmit={onSubmit} aria-busy={isSaving}>
        <PageSurfaceContent>
        <PageHeader className="flex-col sm:flex-row"
          action={
            <PageActionGroup>
              <Button type="button" disabled={isSaving} onClick={onBackToRecord}>
                {t("detailPages.employee.editPage.backToRecord")}
              </Button>
              <Button type="button" variant="outline" disabled={isSaving} onClick={onBackToEmployees}>
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
              {saveError}
            </p>
          </div>
        ) : null}

        <fieldset disabled={isSaving} className="flex min-w-0 flex-col gap-6 border-0 p-0">
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
                {roles.filter((role) => selectableRole(role.key)).map((role) => (
                  <option key={role.id} disabled={!allowWorkerRoleChange && currentRoleKey !== "worker" && role.key === "worker"} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </NativeSelect>
              {!allowWorkerRoleChange && currentRoleKey !== "worker" ? (
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
                onChange={(event) => setState({ ...state, status: event.target.value as FormState["status"] })}
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
                      setPlacementDirty(true)
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
                          setPlacementDirty(true)
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
                      <NativeSelect disabled={!workerManagerId} value={workerProjectId} onChange={(event) => {
                        setPlacementDirty(true)
                        setWorkerProjectId(event.target.value)
                      }}>
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
                    <NativeSelect value={workerWarehouseId} onChange={(event) => {
                      setPlacementDirty(true)
                      setWorkerWarehouseId(event.target.value)
                    }}>
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
              onToggle={(projectId) => {
                setManagedProjectsDirty(true)
                setSelectedManagedProjectIds((current) =>
                  current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
                )
              }}
            />
          ) : null}

          {isWarehouseManager ? (
            <ManagedScopeSection
              description={t("detailPages.employee.editPage.managedWarehousesDescription")}
              items={managedWarehouseOptions}
              selectedIds={selectedManagedWarehouseIds}
              title={t("detailPages.employee.editPage.managedWarehousesTitle")}
              onToggle={(warehouseId) => {
                setManagedWarehousesDirty(true)
                setSelectedManagedWarehouseIds((current) =>
                  current.includes(warehouseId) ? current.filter((id) => id !== warehouseId) : [...current, warehouseId],
                )
              }}
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
                aria-label={t("detailPages.employee.editPage.salaryAmount")}
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

        </fieldset>
        <PageFooterActions className="flex-wrap">
          <Button type="button" variant="outline" disabled={isSaving} onClick={onBackToRecord}>
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