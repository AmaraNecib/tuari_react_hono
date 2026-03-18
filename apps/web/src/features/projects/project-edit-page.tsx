import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { FieldSection, NativeSelect, Textarea } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { useUpdateProjectMutation } from "@/features/app-shell/mock-dashboard"

import type { ProjectPageRecord } from "./project-details-page"

export function ProjectEditPage({
  managerOptions,
  project,
}: {
  managerOptions: Array<{ id: string; label: string }>
  project: ProjectPageRecord
}) {
  const navigate = useNavigate()
  const updateProjectMutation = useUpdateProjectMutation()
  const [state, setState] = useState({
    name: project.name,
    location: project.location ?? "",
    managerId: project.managerId ?? "",
    status: project.status,
    notes: project.notes ?? "",
  })
  const statusOptions = useMemo(
    () => [
      { value: "ACTIVE", label: "نشط" },
      { value: "STOPPED", label: "متوقف" },
      { value: "COMPLETED", label: "مكتمل" },
      { value: "ARCHIVED", label: "مؤرشف" },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{`تعديل ${project.name}`}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">صفحة مستقلة لتحديث بيانات المشروع ومديره وحالته.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void navigate({ to: "/projects/$projectId" as never, params: { projectId: project.id } as never })}>
            العودة إلى المشروع
          </Button>
          <Button variant="outline" onClick={() => void navigate({ to: "/projects" as never })}>
            العودة إلى المشاريع
          </Button>
        </div>
      </div>

      <FieldSection description="بيانات المشروع الأساسية ومديره الحالي." title="معلومات المشروع">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="اسم المشروع">
            <Input value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} />
          </Field>
          <Field label="الموقع">
            <Input value={state.location} onChange={(event) => setState({ ...state, location: event.target.value })} />
          </Field>
          <Field label="مدير المشروع">
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
        <Button variant="outline" onClick={() => void navigate({ to: "/projects/$projectId" as never, params: { projectId: project.id } as never })}>
          إلغاء
        </Button>
        <Button
          disabled={updateProjectMutation.isPending}
          onClick={async () => {
            const nextManagerId = state.managerId || null
            await updateProjectMutation.mutateAsync({
              id: project.id,
              name: state.name.trim(),
              location: state.location.trim() || null,
              managerId: nextManagerId !== project.managerId ? nextManagerId : undefined,
              status: state.status as "ACTIVE" | "STOPPED" | "COMPLETED" | "ARCHIVED",
              notes: state.notes.trim() || null,
            })

            void navigate({ to: "/projects/$projectId" as never, params: { projectId: project.id } as never })
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
