import type { Role } from "@tuari/contracts"

import { Button } from "@/components/ui/button"
import { CurrencyInput, NativeSelect } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"

import type { EmployeeDraft, EmployeeDraftErrors } from "./employee-batch-schema"

export type EmployeeManagerOption = {
  id: string
  label: string
  projectOptions: Array<{ id: string; label: string }>
}

type EmployeeBatchRowCardCopy = {
  title: string
  firstNameLabel: string
  lastNameLabel: string
  phoneLabel: string
  roleLabel: string
  salaryAmountLabel: string
  salaryPeriodLabel: string
  salaryAmountPlaceholder: string
  salaryPeriodPlaceholder: string
  salaryPeriodOptions: Array<{ value: "DAILY" | "WEEKLY" | "MONTHLY"; label: string }>
  managerLabel: string
  managerPlaceholder: string
  managerDisabledHint: string
  projectLabel: string
  projectPlaceholder: string
  projectDisabledHint: string
  notesLabel: string
  firstNamePlaceholder: string
  lastNamePlaceholder: string
  phonePlaceholder: string
  rolePlaceholder: string
  notesPlaceholder: string
  remove: string
}

type EmployeeBatchRowCardProps = {
  copy: EmployeeBatchRowCardCopy
  draft: EmployeeDraft
  errors: EmployeeDraftErrors
  index: number
  roles: Role[]
  managerOptions: EmployeeManagerOption[]
  workerRoleId: string | null
  canRemove: boolean
  onChange: (index: number, field: keyof EmployeeDraft, value: string) => void
  onRemove: (index: number) => void
}

const fieldClassName =
  "flex h-12 w-full rounded-xl border border-border/80 bg-sidebar px-4 text-sm text-foreground shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] outline-none transition focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-background dark:[color-scheme:dark] dark:shadow-none"

export function EmployeeBatchRowCard({
  copy,
  draft,
  errors,
  index,
  roles,
  managerOptions,
  workerRoleId,
  canRemove,
  onChange,
  onRemove,
}: EmployeeBatchRowCardProps) {
  const canAssignManager = workerRoleId !== null && draft.roleId === workerRoleId
  const selectedManager = managerOptions.find((manager) => manager.id === draft.managerId) ?? null
  const availableProjects = selectedManager?.projectOptions ?? []

  return (
    <article className="rounded-xl border border-border/55 bg-sidebar p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">{copy.title}</h3>
        {canRemove ? (
          <Button size="sm" type="button" variant="outline" onClick={() => onRemove(index)}>
            {copy.remove}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <label className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-foreground">{copy.firstNameLabel}</span>
          <Input
            name={`employee-first-name-${index}`}
            placeholder={copy.firstNamePlaceholder}
            value={draft.firstName}
            onChange={(event) => onChange(index, "firstName", event.target.value)}
          />
          {errors.firstName ? <p className="text-sm text-destructive">{errors.firstName}</p> : null}
        </label>

        <label className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-foreground">{copy.lastNameLabel}</span>
          <Input
            name={`employee-last-name-${index}`}
            placeholder={copy.lastNamePlaceholder}
            value={draft.lastName}
            onChange={(event) => onChange(index, "lastName", event.target.value)}
          />
          {errors.lastName ? <p className="text-sm text-destructive">{errors.lastName}</p> : null}
        </label>

        <label className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-foreground">{copy.phoneLabel}</span>
          <Input
            dir="ltr"
            inputMode="tel"
            name={`employee-phone-${index}`}
            placeholder={copy.phonePlaceholder}
            value={draft.phone}
            onChange={(event) => onChange(index, "phone", event.target.value)}
          />
          {errors.phone ? <p className="text-sm text-destructive">{errors.phone}</p> : null}
        </label>

        <label className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-foreground">{copy.roleLabel}</span>
          <select className={fieldClassName} name={`employee-role-${index}`} value={draft.roleId} onChange={(event) => onChange(index, "roleId", event.target.value)}>
            <option value="">{copy.rolePlaceholder}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          {errors.roleId ? <p className="text-sm text-destructive">{errors.roleId}</p> : null}
        </label>

        <label className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-foreground">{copy.salaryAmountLabel}</span>
          <CurrencyInput
            currencyLabel="دج"
            name={`employee-salary-amount-${index}`}
            placeholder={copy.salaryAmountPlaceholder}
            value={draft.salaryAmountDzd}
            onChange={(event) => onChange(index, "salaryAmountDzd", event.target.value)}
          />
          {errors.salaryAmountDzd ? <p className="text-sm text-destructive">{errors.salaryAmountDzd}</p> : null}
        </label>

        <label className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-foreground">{copy.salaryPeriodLabel}</span>
          <NativeSelect
            name={`employee-salary-period-${index}`}
            value={draft.salaryPeriod}
            onChange={(event) => onChange(index, "salaryPeriod", event.target.value)}
          >
            <option value="">{copy.salaryPeriodPlaceholder}</option>
            {copy.salaryPeriodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          {errors.salaryPeriod ? <p className="text-sm text-destructive">{errors.salaryPeriod}</p> : null}
        </label>

        <div className="flex flex-col gap-2.5">
          <label className="text-sm font-medium text-foreground" htmlFor={`employee-manager-${index}`}>
            {copy.managerLabel}
          </label>
          <select
            className={fieldClassName}
            disabled={!canAssignManager || managerOptions.length === 0}
            id={`employee-manager-${index}`}
            name={`employee-manager-${index}`}
            value={draft.managerId}
            onChange={(event) => onChange(index, "managerId", event.target.value)}
          >
            <option value="">{copy.managerPlaceholder}</option>
            {managerOptions.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-muted-foreground">
            {canAssignManager ? copy.managerPlaceholder : copy.managerDisabledHint}
          </p>
          {errors.managerId ? <p className="text-sm text-destructive">{errors.managerId}</p> : null}
        </div>

        {canAssignManager ? (
          <div className="flex flex-col gap-2.5 xl:col-span-2">
            <label className="text-sm font-medium text-foreground" htmlFor={`employee-project-${index}`}>
              {copy.projectLabel}
            </label>
            <select
              className={fieldClassName}
              disabled={!draft.managerId || availableProjects.length === 0}
              id={`employee-project-${index}`}
              name={`employee-project-${index}`}
              value={draft.projectId}
              onChange={(event) => onChange(index, "projectId", event.target.value)}
            >
              <option value="">{copy.projectPlaceholder}</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </select>
            <p className="text-xs leading-5 text-muted-foreground">
              {draft.managerId ? copy.projectPlaceholder : copy.projectDisabledHint}
            </p>
            {errors.projectId ? <p className="text-sm text-destructive">{errors.projectId}</p> : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-2.5 xl:col-span-3">
          <span className="text-sm font-medium text-foreground">{copy.notesLabel}</span>
          <textarea
            className="min-h-[120px] w-full rounded-xl border border-border/80 bg-sidebar px-4 py-3 text-sm text-foreground shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] outline-none transition placeholder:text-muted-foreground/80 focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10 dark:bg-background dark:shadow-none"
            name={`employee-notes-${index}`}
            placeholder={copy.notesPlaceholder}
            value={draft.notes}
            onChange={(event) => onChange(index, "notes", event.target.value)}
          />
          {errors.notes ? <p className="text-sm text-destructive">{errors.notes}</p> : null}
        </label>
      </div>
    </article>
  )
}
