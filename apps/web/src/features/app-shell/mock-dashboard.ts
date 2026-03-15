import "@/i18n"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AuthBootstrapInput,
  Employee,
  EmployeeManagerAssignment,
  EmployeeProjectAssignment,
  Project,
  Role,
  SessionUser,
  Warehouse,
} from "@tuari/contracts"

import { usePhoneSignInMutation } from "@/features/auth/use-phone-sign-in-mutation"
import { useSessionQuery } from "@/features/session/use-session-query"
import { i18n } from "@/i18n"
import { authClient } from "@/lib/auth-client"
import { orpc, rpcClient } from "@/lib/orpc-client"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

export type SectionKey = "employees" | "projects" | "warehouses" | "roles" | "settings"
export type DemoSession = SessionUser | null
export type DemoEmployee = Employee
export type DemoWorkspace = {
  roles: Role[]
  employees: Employee[]
  projects: Project[]
  warehouses: Warehouse[]
  managerAssignments: EmployeeManagerAssignment[]
  projectAssignments: EmployeeProjectAssignment[]
}

type EntityResult<T> =
  | { success: true; message: string; item: T }
  | { success: false; error: { message: string } }

type DeleteResult =
  | { success: true; message: string }
  | { success: false; error: { message: string } }

export const authSetupStatusQueryKey = ["auth", "setup-status"] as const
export const demoWorkspaceQueryKey = ["phase1", "workspace"] as const

async function loadWorkspace(): Promise<DemoWorkspace> {
  const [roles, employees, projects, warehouses, managerAssignments, projectAssignments] = await Promise.all([
    rpcClient.rolesList(),
    rpcClient.employeesList(),
    rpcClient.projectsList(),
    rpcClient.warehousesList(),
    rpcClient.managerAssignmentsList(),
    rpcClient.projectAssignmentsList(),
  ])

  return {
    roles: roles.items,
    employees: employees.items,
    projects: projects.items,
    warehouses: warehouses.items,
    managerAssignments: managerAssignments.items,
    projectAssignments: projectAssignments.items,
  }
}

function requireEntitySuccess<T>(result: EntityResult<T>) {
  if (!result.success) {
    throw new Error(result.error.message)
  }

  return result
}

function requireDeleteSuccess(result: DeleteResult) {
  if (!result.success) {
    throw new Error(result.error.message)
  }

  return result
}

function nextSequence(values: string[], prefix: string) {
  const current = values
    .map((value) => value.replace(prefix, ""))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))

  const largest = current.length > 0 ? Math.max(...current) : 0
  return largest + 1
}

async function ensureWorkspace(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.ensureQueryData({
    queryKey: demoWorkspaceQueryKey,
    queryFn: loadWorkspace,
  })
}

function roleIdByKey(workspace: DemoWorkspace, key: string) {
  return workspace.roles.find((role) => role.key === key)?.id
}

export function useAuthSetupStatusQuery() {
  return useQuery({
    queryKey: authSetupStatusQueryKey,
    queryFn: () => rpcClient.authSetupStatus(),
    staleTime: 5_000,
  })
}

export function useDemoSessionQuery() {
  const sessionQuery = useSessionQuery()

  return {
    ...sessionQuery,
    data: sessionQuery.data?.user ?? null,
  }
}

export function useBootstrapFirstUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["auth", "bootstrap-first-user"],
    mutationFn: async (input: AuthBootstrapInput) => {
      const result = await rpcClient.authBootstrap(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authSetupStatusQueryKey })
      showSuccessToast(i18n.t("toasts.bootstrapSuccess"))
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.bootstrapError"))
    },
  })
}

export function useDemoWorkspaceQuery() {
  const sessionQuery = useSessionQuery()

  return useQuery({
    queryKey: demoWorkspaceQueryKey,
    queryFn: loadWorkspace,
    enabled: Boolean(sessionQuery.data?.user),
  })
}

export function useDemoSignInMutation() {
  return usePhoneSignInMutation()
}

export function useDemoSignOutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "sign-out"],
    mutationFn: async () => {
      await authClient.signOut()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.session.key() })
      await queryClient.removeQueries({ queryKey: demoWorkspaceQueryKey })
      showSuccessToast(i18n.t("toasts.signOutSuccess"))
    },
  })
}

export function useAddWorkspaceRecordMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "add"],
    mutationFn: async (section: SectionKey) => {
      if (section === "settings") {
        return { message: i18n.t("toasts.settingsSynced"), section }
      }

      const workspace = await ensureWorkspace(queryClient)
      const timestamp = new Date().toISOString()

      if (section === "roles") {
        const sequence = nextSequence(workspace.roles.map((role) => role.id), "role-custom-")
        const result = await rpcClient.rolesCreate({
          key: `custom_${sequence}`,
          name: i18n.t("mockData.customRoleName", { count: sequence }),
          description: i18n.t("mockData.customRoleDescription"),
        })
        const success = requireEntitySuccess(result)
        return { message: success.message, section }
      }

      if (section === "projects") {
        const sequence = nextSequence(workspace.projects.map((project) => project.id), "project-")
        const managerId = workspace.projects.find((project) => project.managerId)?.managerId ?? null
        const result = await rpcClient.projectsCreate({
          name: i18n.t("mockData.projectName", { count: sequence }),
          location: sequence % 2 === 0 ? i18n.t("mockData.projectLocationEven") : i18n.t("mockData.projectLocationOdd"),
          managerId,
          notes: i18n.t("mockData.projectNotes"),
          status: "ACTIVE",
        })
        const success = requireEntitySuccess(result)
        return { message: success.message, section }
      }

      if (section === "warehouses") {
        const sequence = nextSequence(workspace.warehouses.map((warehouse) => warehouse.id), "warehouse-")
        const result = await rpcClient.warehousesCreate({
          name: i18n.t("mockData.warehouseName", { count: sequence }),
          address:
            sequence % 2 === 0 ? i18n.t("mockData.warehouseAddressEven") : i18n.t("mockData.warehouseAddressOdd"),
          managerId: null,
          notes: i18n.t("mockData.warehouseNotes"),
          status: "ACTIVE",
        })
        const success = requireEntitySuccess(result)
        return { message: success.message, section }
      }

      const workerRoleId = roleIdByKey(workspace, "worker")
      if (!workerRoleId) {
        throw new Error(i18n.t("toasts.missingWorkerRole"))
      }

      const sequence = workspace.employees.length + 1
      const employeeResult = await rpcClient.employeesCreate({
        firstName: i18n.t("mockData.employeeFirstName"),
        lastName: i18n.t("mockData.employeeLastName", { count: sequence }),
        phone: `05${(10000000 + sequence).toString().slice(-8)}`,
        roleId: workerRoleId,
        status: "ACTIVE",
        notes: i18n.t("mockData.employeeNotes"),
      })
      const employee = requireEntitySuccess(employeeResult).item

      const projectManagerRoleId = roleIdByKey(workspace, "project_manager")
      const manager = workspace.employees.find(
        (item) => item.roleId === projectManagerRoleId && item.status === "ACTIVE",
      )
      const project = workspace.projects.find(
        (item) => item.status === "ACTIVE" && item.managerId === manager?.id,
      )

      if (manager) {
        const managerAssignment = await rpcClient.managerAssignmentsCreate({
          workerId: employee.id,
          managerId: manager.id,
          status: "ACTIVE",
          startDate: timestamp,
          notes: i18n.t("mockData.managerAssignmentNotes"),
        })
        requireEntitySuccess(managerAssignment)
      }

      if (project) {
        const projectAssignment = await rpcClient.projectAssignmentsCreate({
          employeeId: employee.id,
          projectId: project.id,
          status: "ACTIVE",
          startDate: timestamp,
          notes: i18n.t("mockData.projectAssignmentNotes"),
        })
        requireEntitySuccess(projectAssignment)
      }

      return { message: i18n.t("mockData.employeeCreated"), section }
    },
    onSuccess: async ({ message }) => {
      await queryClient.invalidateQueries({ queryKey: demoWorkspaceQueryKey })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.addError"))
    },
  })
}

export function useRemoveWorkspaceRecordMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "remove"],
    mutationFn: async ({ section, id }: { section: Exclude<SectionKey, "settings">; id: string }) => {
      if (section === "roles") {
        const result = await rpcClient.rolesDelete({ id })
        return requireDeleteSuccess(result)
      }

      if (section === "employees") {
        const result = await rpcClient.employeesUpdate({
          id,
          status: "LEFT",
        })
        return { success: true as const, message: requireEntitySuccess(result).message }
      }

      if (section === "projects") {
        const result = await rpcClient.projectsUpdate({
          id,
          status: "ARCHIVED",
        })
        return { success: true as const, message: requireEntitySuccess(result).message }
      }

      const result = await rpcClient.warehousesUpdate({
        id,
        status: "ARCHIVED",
      })
      return { success: true as const, message: requireEntitySuccess(result).message }
    },
    onSuccess: async ({ message }) => {
      await queryClient.invalidateQueries({ queryKey: demoWorkspaceQueryKey })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useResetWorkspaceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "reset"],
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: demoWorkspaceQueryKey })
      return { success: true as const }
    },
    onSuccess: () => {
      showSuccessToast(i18n.t("toasts.resetSuccess"))
    },
    onError: () => {
      showErrorToast(i18n.t("toasts.resetError"))
    },
  })
}
