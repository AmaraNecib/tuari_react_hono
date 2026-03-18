import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { EmployeeBatchCreatePage } from "@/features/employees/employee-batch-create-page"
import {
  EmployeeTable,
  type EmployeeTableRow,
} from "@/features/employees/employee-table"
import type { EmployeeManagerOption } from "@/features/employees/employee-batch-row-card"
import { cn } from "@/lib/utils"
import type { Role } from "@tuari/contracts"

import {
  useDeleteEmployeeMutation,
  useLeaveEmployeeMutation,
} from "./mock-dashboard"
import { SectionHeader } from "./section-header"

type EmployeesSectionProps = {
  createHref: string
  emptyLabel: string
  employeePage: "list" | "create"
  managerOptions: EmployeeManagerOption[]
  roles: Role[]
  title: string
  description: string
  addWorkerLabel: string
  columns: {
    name: string
    role: string
    manager: string
    project: string
    phone: string
    status: string
    actions: string
  }
  actionLabels: {
    view: string
    edit: string
    leave: string
    delete: string
    leaveTitle: string
    leaveDescription: string
    deleteTitle: string
    deleteDescription: string
  }
  rows: EmployeeTableRow[]
}

type PendingAction =
  | { type: "leave"; employee: EmployeeTableRow }
  | { type: "delete"; employee: EmployeeTableRow }

export function EmployeesSection({
  createHref,
  emptyLabel,
  employeePage,
  managerOptions,
  roles,
  title,
  description,
  addWorkerLabel,
  columns,
  actionLabels,
  rows,
}: EmployeesSectionProps) {
  const navigate = useNavigate()
  const leaveEmployeeMutation = useLeaveEmployeeMutation()
  const deleteEmployeeMutation = useDeleteEmployeeMutation()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  if (employeePage === "create") {
    return (
      <EmployeeBatchCreatePage
        managerOptions={managerOptions}
        roles={roles}
        onCancel={() => void navigate({ to: "/employees" as never })}
        onDone={() => void navigate({ to: "/employees" as never })}
      />
    )
  }

  const actionEmployee = pendingAction?.employee ?? null

  return (
    <>
      <div className="space-y-6">
        <SectionHeader
          action={
            <Link
              className={cn(buttonVariants({ variant: "default" }), "h-10 rounded-2xl px-4")}
              to={createHref as never}
            >
              {addWorkerLabel}
            </Link>
          }
          description={description}
          title={title}
        />
        <EmployeeTable
          copy={{
            name: columns.name,
            role: columns.role,
            manager: columns.manager,
            project: columns.project,
            phone: columns.phone,
            status: columns.status,
            actions: columns.actions,
            empty: emptyLabel,
            view: actionLabels.view,
            edit: actionLabels.edit,
            leave: actionLabels.leave,
            delete: actionLabels.delete,
          }}
          rows={rows}
          onDelete={(row) => setPendingAction({ type: "delete", employee: row })}
          onEdit={(row) => void navigate({ to: "/employees/$employeeId/edit" as never, params: { employeeId: row.id } as never })}
          onLeave={(row) => setPendingAction({ type: "leave", employee: row })}
          onView={(row) => void navigate({ to: "/employees/$employeeId" as never, params: { employeeId: row.id } as never })}
        />
      </div>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => (!open ? setPendingAction(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "delete" ? actionLabels.deleteTitle : actionLabels.leaveTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "delete"
                ? `${actionLabels.deleteDescription} ${actionEmployee?.name ?? ""}`
                : `${actionLabels.leaveDescription} ${actionEmployee?.name ?? ""}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingAction) {
                  return
                }

                if (pendingAction.type === "delete") {
                  await deleteEmployeeMutation.mutateAsync(pendingAction.employee.id)
                } else {
                  await leaveEmployeeMutation.mutateAsync(pendingAction.employee.id)
                }

                setPendingAction(null)
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
