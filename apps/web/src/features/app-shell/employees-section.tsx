import { useMemo, useRef, useState } from "react"
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
import { AdvancedSearchBar } from "@/features/shared/advanced-search-bar"
import { EmployeeBatchCreatePage } from "@/features/employees/employee-batch-create-page"
import {
  EmployeeTable,
  type EmployeeTableRow,
} from "@/features/employees/employee-table"
import type { EmployeeManagerOption } from "@/features/employees/employee-batch-row-card"
import { cn } from "@/lib/utils"
import type { Employee, Role } from "@tuari/contracts"

import {
  useDeleteEmployeeMutation,
  useLeaveEmployeeMutation,
} from "./workspace-mutations"
import { useHomeViewNavigation } from "./home-view-navigation"
import { RecordPageFrame } from "@/features/shared/record-page-frame"
import { type WorkspaceRouteTarget, WorkspaceLink } from "@/router/navigation"
import { useEmployeesPagedQuery } from "./workspace-queries"

const DEFAULT_LIMIT = 50

type EmployeesSectionProps = {
  createTarget: WorkspaceRouteTarget
  emptyLabel: string
  employeePage: "list" | "create"
  managerOptions: EmployeeManagerOption[]
  /** Seam-supplied row builder (HomeViewDerived.buildEmployeeTableRow). */
  buildEmployeeTableRow: (employee: Employee) => EmployeeTableRow
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
}

type PendingAction =
  | { type: "leave"; employee: EmployeeTableRow }
  | { type: "delete"; employee: EmployeeTableRow }

/** Employees section with table, pagination, and CRUD actions. */
/**
 * @description Component
 */
export function EmployeesSection({
  createTarget,
  emptyLabel,
  employeePage,
  managerOptions,
  buildEmployeeTableRow,
  roles,
  title,
  addWorkerLabel,
  columns,
  actionLabels,
  cursor,
  limit,
}: EmployeesSectionProps) {
  const { t } = useTranslation()
  const navigation = useHomeViewNavigation()
    const leaveEmployeeMutation = useLeaveEmployeeMutation()
  const deleteEmployeeMutation = useDeleteEmployeeMutation()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [query, setQuery] = useState("")
  const actionInFlightRef = useRef(false)

  const resolvedLimit = limit ?? DEFAULT_LIMIT
  const normalizedQuery = query.trim()
  const pagedQuery = useEmployeesPagedQuery({
    // While searching, ignore the URL cursor: a stale cursor from a previous
    // page (or a previous search) would otherwise jump into the middle of the
    // filtered set. Search always starts at the first page of matches.
    cursor: normalizedQuery ? undefined : cursor,
    limit: resolvedLimit,
    search: normalizedQuery || undefined,
  })

  // Rows come pre-filtered from the server (issue #183): the paged RPC
  // applies `search` across all records before pagination, so no local
  // page-level filtering is needed here. Each row is built through the
  // dashboard's view-model seam (issue #217), so the employees page and the
  // dashboard always render the same employee from identical data.
  const rows = useMemo<EmployeeTableRow[]>(
    () => pagedQuery.data?.items.map((employee) => buildEmployeeTableRow(employee)) ?? [],
    [pagedQuery.data?.items, buildEmployeeTableRow],
  )

      
  
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
        <AdvancedSearchBar
          onSearch={(searchQuery) => setQuery(searchQuery)}
          storageKey="employees-search-filters"
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
              addWorker: addWorkerLabel,
              view: actionLabels.view,
              edit: actionLabels.edit,
              leave: actionLabels.leave,
              delete: actionLabels.delete,
            }}
            rows={rows}
            onAdd={() => void navigation.goToEmployeeCreate()}
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
