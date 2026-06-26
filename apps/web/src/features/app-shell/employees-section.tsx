import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

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
import { useHomeViewNavigation } from "./home-view-navigation"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { type WorkspaceRouteTarget, WorkspaceLink } from "@/router/navigation"
import {
  buildEmployeeRelationshipFacts,
  buildEmployeeRow,
} from "./home-view-derived-employees"
import { buildHomeViewDerivedLookups } from "./home-view-derived-lookups"
import { useEmployeesPagedQuery } from "./workspace-queries"
import type { DemoWorkspace } from "./workspace-queries"

const DEFAULT_LIMIT = 50

type EmployeesSectionProps = {
  createTarget: WorkspaceRouteTarget
  emptyLabel: string
  employeePage: "list" | "create"
  managerOptions: EmployeeManagerOption[]
  noManagerLabel: string
  noProjectLabel: string
  roles: Role[]
  title: string
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
  cursor?: string
  limit?: number
  workspace: DemoWorkspace
}

type PendingAction =
  | { type: "leave"; employee: EmployeeTableRow }
  | { type: "delete"; employee: EmployeeTableRow }

export function EmployeesSection({
  createTarget,
  emptyLabel,
  employeePage,
  managerOptions,
  noManagerLabel,
  noProjectLabel,
  roles,
  title,
  addWorkerLabel,
  columns,
  actionLabels,
  cursor,
  limit,
  workspace,
}: EmployeesSectionProps) {
  const { t } = useTranslation()
  const navigation = useHomeViewNavigation()
    const leaveEmployeeMutation = useLeaveEmployeeMutation()
  const deleteEmployeeMutation = useDeleteEmployeeMutation()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const actionInFlightRef = useRef(false)
  
  const resolvedLimit = limit ?? DEFAULT_LIMIT
  const pagedQuery = useEmployeesPagedQuery({
    cursor,
    limit: resolvedLimit,
  })

  const lookups = useMemo(() => buildHomeViewDerivedLookups(workspace), [workspace])
  const relationshipFacts = useMemo(
    () => buildEmployeeRelationshipFacts(workspace),
    [workspace],
  )

  const rows = useMemo<EmployeeTableRow[]>(() => {
    const items = pagedQuery.data?.items ?? []
    return items.map((employee) =>
      buildEmployeeRow({
        copy: { shell: { noManager: noManagerLabel, noProject: noProjectLabel } },
        employee,
        lookups,
        relationshipFacts,
        t,
      }),
    )
  }, [pagedQuery.data?.items, lookups, relationshipFacts, noManagerLabel, noProjectLabel, t])

      
  // Reset the previous-cursor stack when the user changes page size —
  // the stored cursors were computed against the old limit and would point
  // at the wrong rows in the new grid. Skip the initial mount so the
  // URL-restored stack is preserved.
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    setPreviousCursorStack([])
  }, [resolvedLimit])

  if (employeePage === "create") {
    return (
      <EmployeeBatchCreatePage
        managerOptions={managerOptions}
        roles={roles}
        onCancel={() => void navigation.goToEmployees()}
        onDone={() => void navigation.goToEmployees()}
      />
    )
  }

  const actionEmployee = pendingAction?.employee ?? null
  const actionPending = pendingAction?.type === "delete" ? deleteEmployeeMutation.isPending : leaveEmployeeMutation.isPending

      return (
    <>
      <RecordPageFrame
        action={
          <WorkspaceLink
            className={cn(buttonVariants({ variant: "default", size: "lg" }))}
            target={createTarget}
          >
            {addWorkerLabel}
          </WorkspaceLink>
        }
        title={title}
      >
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
            onEdit={(row) => void navigation.goToEmployeeEdit(row.id)}
            onLeave={(row) => setPendingAction({ type: "leave", employee: row })}
            onView={(row) => void navigation.goToEmployeeDetails(row.id)}
        />
      </RecordPageFrame>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => (!open && !actionPending ? setPendingAction(null) : null)}>
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
            <AlertDialogCancel disabled={actionPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionPending}
              onClick={async () => {
                if (!pendingAction || actionPending) {
                  return
                }

                if (actionInFlightRef.current) {
                  return
                }

                actionInFlightRef.current = true

                try {
                  if (pendingAction.type === "delete") {
                    await deleteEmployeeMutation.mutateAsync(pendingAction.employee.id)
                  } else {
                    await leaveEmployeeMutation.mutateAsync(pendingAction.employee.id)
                  }

                  setPendingAction(null)
                } finally {
                  actionInFlightRef.current = false
                }
              }}
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
