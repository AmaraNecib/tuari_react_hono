import type { ReactNode } from "react"

import { FieldSection, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"

import type { WarehousePageRecord } from "./warehouse-details-page"

export type WarehouseFormState = {
  name: string
  address: string
  managerId: string
  status: WarehousePageRecord["status"]
  notes: string
}

export type WarehouseFormErrors = Partial<Record<keyof WarehouseFormState, string>>

export function createWarehouseFormState(warehouse?: WarehousePageRecord | null): WarehouseFormState {
  return {
    name: warehouse?.name ?? "",
    address: warehouse?.address ?? "",
    managerId: warehouse?.managerId ?? "",
    status: warehouse?.status ?? "ACTIVE",
    notes: warehouse?.notes ?? "",
  }
}

/** Reusable form fields for warehouse create/edit. */
export function WarehouseFormFields({
  errors,
  labels,
  managerOptions,
  state,
  statusOptions,
  title,
  description,
  onChange,
}: {
  errors: WarehouseFormErrors
  labels: {
    name: string
    address: string
    manager: string
    status: string
    notes: string
    noManager: string
  }
  managerOptions: Array<{ id: string; label: string }>
  state: WarehouseFormState
  statusOptions: Array<{ value: WarehouseFormState["status"]; label: string }>
  title: string
  description: string
  onChange: (nextState: WarehouseFormState) => void
}) {
  return (
    <FieldSection description={description} title={title}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field error={errors.name} label={labels.name}>
          <Input required value={state.name} onChange={(event) => onChange({ ...state, name: event.target.value })} />
        </Field>
        <Field error={errors.address} label={labels.address}>
          <Input value={state.address} onChange={(event) => onChange({ ...state, address: event.target.value })} />
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
            onChange={(event) => onChange({ ...state, status: event.target.value as WarehouseFormState["status"] })}
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
    <label className="space-y-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {error ? <p className="text-destructive">{error}</p> : null}
    </label>
  )
}
