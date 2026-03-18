import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { FieldSection, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { useUpdateWarehouseMutation } from "@/features/app-shell/mock-dashboard"

import type { WarehousePageRecord } from "./warehouse-details-page"

export function WarehouseEditPage({
  managerOptions,
  warehouse,
}: {
  managerOptions: Array<{ id: string; label: string }>
  warehouse: WarehousePageRecord
}) {
  const navigate = useNavigate()
  const updateWarehouseMutation = useUpdateWarehouseMutation()
  const [state, setState] = useState({
    name: warehouse.name,
    address: warehouse.address ?? "",
    managerId: warehouse.managerId ?? "",
    status: warehouse.status,
    notes: warehouse.notes ?? "",
  })
  const statusOptions = useMemo(
    () => [
      { value: "ACTIVE", label: "نشط" },
      { value: "INACTIVE", label: "غير نشط" },
      { value: "ARCHIVED", label: "مؤرشف" },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{`تعديل ${warehouse.name}`}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">صفحة مستقلة لتحديث بيانات المستودع ومديره وحالته.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void navigate({ to: "/warehouses/$warehouseId" as never, params: { warehouseId: warehouse.id } as never })}>
            العودة إلى المستودع
          </Button>
          <Button variant="outline" onClick={() => void navigate({ to: "/warehouses" as never })}>
            العودة إلى المستودعات
          </Button>
        </div>
      </div>

      <FieldSection description="بيانات المستودع الأساسية ومديره الحالي." title="معلومات المستودع">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="اسم المستودع">
            <Input value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} />
          </Field>
          <Field label="العنوان">
            <Input value={state.address} onChange={(event) => setState({ ...state, address: event.target.value })} />
          </Field>
          <Field label="مدير المستودع">
            <NativeSelect value={state.managerId} onChange={(event) => setState({ ...state, managerId: event.target.value })}>
              <option value="">بدون مدير محدد</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="الحالة">
            <NativeSelect value={state.status} onChange={(event) => setState({ ...state, status: event.target.value })}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex flex-col gap-2 md:col-span-2 xl:col-span-3">
            <span className="text-sm font-medium text-foreground">ملاحظات</span>
            <Textarea value={state.notes} onChange={(event) => setState({ ...state, notes: event.target.value })} />
          </label>
        </div>
      </FieldSection>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => void navigate({ to: "/warehouses/$warehouseId" as never, params: { warehouseId: warehouse.id } as never })}>
          إلغاء
        </Button>
        <Button
          disabled={updateWarehouseMutation.isPending}
          onClick={async () => {
            const nextManagerId = state.managerId || null
            await updateWarehouseMutation.mutateAsync({
              id: warehouse.id,
              name: state.name.trim(),
              address: state.address.trim() || null,
              managerId: nextManagerId !== warehouse.managerId ? nextManagerId : undefined,
              status: state.status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
              notes: state.notes.trim() || null,
            })

            void navigate({ to: "/warehouses/$warehouseId" as never, params: { warehouseId: warehouse.id } as never })
          }}
        >
          حفظ التعديل
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
