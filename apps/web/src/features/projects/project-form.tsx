import type { ReactNode } from "react"

import { FieldSection, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"

import type { ProjectPageRecord } from "./project-details-page"

export type ProjectFormState = {
  name: string
  location: string
  managerId: string
  status: ProjectPageRecord["status"]
  notes: string
}

export type ProjectFormErrors = Partial<Record<keyof ProjectFormState, string>>

export function createProjectFormState(project?: ProjectPageRecord | null): ProjectFormState {
  return {
    name: project?.name ?? "",
    location: project?.location ?? "",
    managerId: project?.managerId ?? "",
    status: project?.status ?? "ACTIVE",
    notes: project?.notes ?? "",
  }
}

export function ProjectFormFields({
  errors,
  labels,
  managerOptions,
  state,
  statusOptions,
  title,
  description,
  onChange,
}: {
  errors: ProjectFormErrors
  labels: {
    name: string
    location: string
    manager: string
    status: string
    notes: string
    noManager: string
  }
  managerOptions: Array<{ id: string; label: string }>
  state: ProjectFormState
  statusOptions: Array<{ value: ProjectFormState["status"]; label: string }>
  title: string
  description: string
  onChange: (nextState: ProjectFormState) => void
}) {
  return (
    <FieldSection description={description} title={title}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field error={errors.name} label={labels.name}>
          <Input required value={state.name} onChange={(event) => onChange({ ...state, name: event.target.value })} />
        </Field>
        <Field error={errors.location} label={labels.location}>
          <Input value={state.location} onChange={(event) => onChange({ ...state, location: event.target.value })} />
        </Field>
        <Field error={errors.managerId} label={labels.manager}>
          <NativeSelect value={state.managerId} onChange={(event) => onChange({ ...state, managerId: event.target.value })}>
            <option value="">{labels.noManager}</option>
            {managerOptions.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field error={errors.status} label={labels.status}>
          <NativeSelect
            value={state.status}
            onChange={(event) => onChange({ ...state, status: event.target.value as ProjectFormState["status"] })}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-3">
          <span className="text-sm font-medium text-foreground">{labels.notes}</span>
          <Textarea value={state.notes} onChange={(event) => onChange({ ...state, notes: event.target.value })} />
          {errors.notes ? <p className="text-sm text-destructive">{errors.notes}</p> : null}
        </label>
      </div>
    </FieldSection>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </label>
  )
}
