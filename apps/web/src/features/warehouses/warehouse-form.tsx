import { FieldSection, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { CreateableSelect } from "@/components/ui/createable-select"
import type { EmployeeInlineCreateConfig } from "@/features/employees/use-employee-inline-create"

import type { WarehousePageRecord } from "./warehouse-details-page"

export type WarehouseFormState = {
  name: string
  address: string
  managerId: string
  status: WarehousePageRecord["status"]
  notes: string
}

export type WarehouseFormErrors = Partial<Record<keyof WarehouseFormState, string>>

/**
 * createWarehouseFormState(warehouse? component.
 */
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
/**
 * @description Component
 */
export function WarehouseFormFields({
  errors,
  labels,
  managerCreate,
  managerDisplayValue,
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
  managerCreate?: EmployeeInlineCreateConfig
  managerDisplayValue?: string
  managerOptions: Array<{ id: string; label: string }>
  state: WarehouseFormState
  statusOptions: Array<{ value: WarehouseFormState["status"]; label: string }>
  title: string
  description: string
  onChange: (nextState: WarehouseFormState) => void
}) {
  return (
    <FieldSection description={description} title={title}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={labels.name} error={errors.name}>
          <Input required value={state.name} onChange={(event) => onChange({ ...state, name: event.target.value })} />
        </Field>
        <Field label={labels.address} error={errors.address}>
          <Input value={state.address} onChange={(event) => onChange({ ...state, address: event.target.value })} />
        </Field>
        <Field label={labels.manager} error={errors.managerId}>
          <CreateableSelect
            value={state.managerId}
            onChange={(value) => onChange({ ...state, managerId: value })}
            options={managerOptions.map((m) => ({ id: m.id, name: m.label }))}
            emptyLabel={labels.noManager}
            displayValue={managerDisplayValue}
            createLabel={managerCreate?.createLabel}
            createFields={managerCreate?.fields}
            onCreate={managerCreate?.onCreate}
          />
        </Field>
        <Field label={labels.status} error={errors.status}>
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
        <Field label={labels.notes} error={errors.notes} className="md:col-span-2">
          <Textarea value={state.notes} onChange={(event) => onChange({ ...state, notes: event.target.value })} />
        </Field>
      </div>
    </FieldSection>
  )
}
