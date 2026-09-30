import "@/i18n"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  algerianPhoneSchema,
  type AppError,
  type AuthBootstrapInput,
  type Employee,
  type EmployeeBatchCreateInput,
  type EmployeeSaveInput,
  type Project,
  type Role,
  type SessionUser,
  type Warehouse,
} from "@tuari/contracts"

import { usePhoneSignInMutation } from "@/features/auth/use-phone-sign-in-mutation"
import { useSessionQuery } from "@/features/session/use-session-query"
import { i18n } from "@/i18n"
import { changeCurrentPassword, signOutDesktopSession, updateCurrentProfile } from "@/lib/auth-api"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { getAuthClient } from "@/lib/auth-client"
import { rpcClient } from "@/lib/orpc-client"
import { getStartupQueryRetryDelay, shouldRetryStartupQuery } from "@/lib/startup-query-retry"
import { showErrorToast, showSuccessToast } from "@/lib/toast"
import { workspaceQueryPrefix } from "./workspace-queries"
import {
  getCachedSessionUserId,
  invalidateWorkspaceDomains,
  sessionQueryKey,
  workspaceDomainQueryPrefix,
  workspaceQueryKeys,
} from "./workspace-keys"

export type SectionKey = "employees" | "projects" | "warehouses" | "roles" | "settings"
export type DemoSession = SessionUser | null
export type DemoEmployee = Employee

type EntityResult<T> =
  | { success: true; message: string; item: T }
  | { success: false; error: { message: string } }

type DeleteResult =
  | { success: true; message: string }
  | { success: false; error: { message: string } }

export class AppMutationError extends Error {
  code: AppError["code"]
  fieldErrors: AppError["fieldErrors"]

  constructor(error: Pick<AppError, "message"> & Partial<Pick<AppError, "code" | "fieldErrors">>) {
    super(error.message)
    this.name = "AppMutationError"
    this.code = error.code ?? "BUSINESS_RULE"
    this.fieldErrors = error.fieldErrors ?? []
  }
}

export type EmployeeBatchCreateResult = {
  createdCount: number
  /**
   * The created rows, with their real ids. Inline-create callers (project
   * manager, warehouse manager, debt party) need the id to select the person
   * they just created; a fabricated id would not exist on the server.
   */
  employees: Employee[]
}

/**
 * authSetupStatusQueryKey = ["auth", "setup-status"] as const component.
 */
export const authSetupStatusQueryKey = ["auth", "setup-status"] as const

function requireEntitySuccess<T>(result: EntityResult<T>) {
  if (!result.success) {
    throw new AppMutationError(result.error)
  }

  return result
}

function requireDeleteSuccess(result: DeleteResult) {
  if (!result.success) {
    throw new AppMutationError(result.error)
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

async function ensureWorkspace(queryClient: ReturnType<typeof useQueryClient>, userId: string | null) {
  const [rolesQuery, projectsQuery, warehousesQuery] = await Promise.all([
    queryClient.ensureQueryData({
      queryKey: workspaceQueryKeys.roles(userId),
      queryFn: () => rpcClient.rolesList(),
    }),
    queryClient.ensureQueryData({
      queryKey: workspaceQueryKeys.projects(userId),
      queryFn: () => rpcClient.projectsList(),
    }),
    queryClient.ensureQueryData({
      queryKey: workspaceQueryKeys.warehouses(userId),
      queryFn: () => rpcClient.warehousesList(),
    }),
  ])

  return {
    roles: rolesQuery.items,
    projects: projectsQuery.items,
    warehouses: warehousesQuery.items,
  }
}

export function useAuthSetupStatusQuery() {
  return useQuery({
    queryKey: authSetupStatusQueryKey,
    queryFn: () => rpcClient.authSetupStatus(),
/**
 * useDemoSessionQuery() component.
 */
    staleTime: 5_000,
    retry: shouldRetryStartupQuery,
    retryDelay: getStartupQueryRetryDelay,
  })
}

/**
 * useBootstrapFirstUserMutation() component.
 */
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
/**
 * useDemoSignInMutation() component.
 */
      const result = await rpcClient.authBootstrap(input)
/**
 * useDemoSignOutMutation() component.
 */
      return requireEntitySuccess(result)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authSetupStatusQueryKey })
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.bootstrapError"))
    },
  })
}

export function useDemoSignInMutation() {
  return usePhoneSignInMutation()
}

export function useDemoSignOutMutation() {
  const queryClient = useQueryClient()

  return useMutation({
/**
 * useUpdateAccountSettingsMutation() component.
 */
    mutationKey: ["phase1", "sign-out"],
    mutationFn: async () => {
      if (isDesktopRuntime()) {
        await signOutDesktopSession()
        return
      }

      await getAuthClient().signOut()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await queryClient.removeQueries({ queryKey: workspaceQueryPrefix })
      await queryClient.removeQueries({ queryKey: workspaceDomainQueryPrefix })
      showSuccessToast(i18n.t("toasts.signOutSuccess"))
    },
  })
}

export function useUpdateAccountSettingsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["auth", "account", "update"],
    mutationFn: async (input: {
      currentPassword?: string
      name?: string
      newPassword?: string
      phone?: string
    }) => {
      const name = input.name?.trim() || undefined
      const phone = input.phone?.trim() || undefined
      // The current password is verified against the stored hash EXACTLY as
      // typed — it is never trimmed/normalized (passwords are opaque secrets;
      // a pre-#230 legacy hash can be all-invisible, #321). Only the NEW
      // password is trimmed so a whitespace-only new credential cannot be
      // created (#230).
      const currentPassword = input.currentPassword || undefined
      const newPassword = input.newPassword?.trim() || undefined

      if (!name && !phone && !currentPassword && !newPassword) {
        throw new Error(i18n.t("toasts.accountNoChanges"))
      }

      if (phone) {
        const phoneResult = algerianPhoneSchema.safeParse(phone)
        if (!phoneResult.success) {
          throw new Error(i18n.t("auth.validation.phoneFormat"))
        }
      }

      if (currentPassword || newPassword) {
        if (!currentPassword) {
          throw new Error(i18n.t("toasts.accountPasswordCurrentRequired"))
        }

        if (!newPassword) {
          throw new Error(i18n.t("toasts.accountPasswordNewRequired"))
        }

        if (newPassword.length < 8 || newPassword.length > 128) {
          throw new Error(i18n.t("auth.validation.passwordShort"))
        }
      }

      if (name || phone) {
        await updateCurrentProfile({ currentPassword, name, phone })
      }
/**
 * useCreateEmployeesBatchMutation() component.
 */

      if (currentPassword && newPassword) {
        await changeCurrentPassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        })
      }
    },
    onSuccess: async () => {
      const userId = getCachedSessionUserId(queryClient)
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      await invalidateWorkspaceDomains(queryClient, userId, { employees: true, projects: true, warehouses: true, debtsSummary: true, debtsDetail: true, systemLog: true })
      showSuccessToast(i18n.t("toasts.accountUpdated"))
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
/**
 * useUpdateEmployeeMutation() component.
 */
  })
}

export function useCreateEmployeesBatchMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "employees", "create-batch"],
    mutationFn: async (input: EmployeeBatchCreateInput): Promise<EmployeeBatchCreateResult> => {
      const result = await rpcClient.employeesBatchCreate(input)
      const success = requireEntitySuccess(result)

      return {
        createdCount: success.item.employees.length,
        employees: success.item.employees,
      }
    },
    onSuccess: async ({ createdCount }) => {
      if (createdCount > 0) {
        await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { employees: true, projects: true, warehouses: true })
      }
    },
  })
}

export function useUpdateEmployeeMutation() {
  const queryClient = useQueryClient()
/**
 * useLeaveEmployeeMutation() component.
 */

  return useMutation({
    mutationKey: ["phase1", "workspace", "employees", "update"],
    mutationFn: async (input: {
      id: string
      firstName?: string
      lastName?: string
      phone?: string
      roleId?: string
      status?: Employee["status"]
      salaryAmountDzd?: number | null
      salaryPeriod?: Employee["salaryPeriod"]
      notes?: string | null
      occupation?: string | null
    }) => {
      const result = await rpcClient.employeesUpdate(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { employees: true, projects: true, warehouses: true, debtsSummary: true, debtsDetail: true })
      showSuccessToast(message)
/**
 * useDeleteEmployeeMutation() component.
 */
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useSaveEmployeeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "employees", "save"],
    mutationFn: async (input: EmployeeSaveInput) =>
      requireEntitySuccess(await rpcClient.employeesSave(input)),
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), {
        employees: true,
        projects: true,
        warehouses: true,
        debtsSummary: true,
        debtsDetail: true,
      })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useLeaveEmployeeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "employees", "leave"],
    mutationFn: async (id: string) => {
      const result = await rpcClient.employeesUpdate({
        id,
        status: "LEFT",
/**
 * useUpdateProjectMutation() component.
 */
      })

      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { employees: true, projects: true, warehouses: true, debtsSummary: true, debtsDetail: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useDeleteEmployeeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "employees", "delete"],
    mutationFn: async (id: string) => {
      const result = await rpcClient.employeesDelete({ id })
      return requireDeleteSuccess(result)
    },
/**
 * useCreateProjectMutation() component.
 */
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { employees: true, projects: true, warehouses: true, debtsSummary: true, debtsDetail: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "projects", "update"],
    mutationFn: async (input: {
      id: string
      name?: string
      location?: string | null
      managerId?: string | null
      status?: Project["status"]
      notes?: string | null
/**
 * useUpdateWarehouseMutation() component.
 */
    }) => {
      const result = await rpcClient.projectsUpdate(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { projects: true, employees: true, warehouses: true, debtsSummary: true, debtsDetail: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "projects", "create"],
    mutationFn: async (input: {
      name: string
      location?: string | null
      managerId?: string | null
/**
 * useCreateWarehouseMutation() component.
 */
      status?: Project["status"]
      notes?: string | null
    }) => {
      const result = await rpcClient.projectsCreate(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { projects: true, employees: true, warehouses: true, debtsSummary: true, debtsDetail: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useUpdateWarehouseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "warehouses", "update"],
    mutationFn: async (input: {
/**
 * useUpdateEmployeeWorkplaceMutation() component.
 */
      id: string
      name?: string
      address?: string | null
      managerId?: string | null
      status?: Warehouse["status"]
      notes?: string | null
    }) => {
      const result = await rpcClient.warehousesUpdate(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { warehouses: true, employees: true, projects: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "warehouses", "create"],
    mutationFn: async (input: {
      name: string
      address?: string | null
      managerId?: string | null
/**
 * useSyncManagedProjectsMutation() component.
 */
      status?: Warehouse["status"]
      notes?: string | null
    }) => {
      const result = await rpcClient.warehousesCreate(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { warehouses: true, employees: true, projects: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useUpdateEmployeeWorkplaceMutation() {
  const queryClient = useQueryClient()

  return useMutation({
/**
 * useSyncManagedWarehousesMutation() component.
 */
    mutationKey: ["phase1", "workspace", "employees", "workplace"],
    mutationFn: async (input: {
      employeeId: string
      managerId?: string | null
      nextType: "NONE" | "PROJECT" | "WAREHOUSE"
      projectId?: string | null
      warehouseId?: string | null
    }) => {
      return requireDeleteSuccess(
        await rpcClient.employeesAssignWorkplace({
          employeeId: input.employeeId,
          managerId: input.managerId ?? null,
          nextType: input.nextType,
          projectId: input.projectId ?? null,
          warehouseId: input.warehouseId ?? null,
        }),
      )
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { employees: true, projects: true, warehouses: true })
/**
 * useCreateSalaryPaymentMutation() component.
 */
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useSyncManagedProjectsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "employees", "managed-projects"],
    mutationFn: async (input: { currentIds: string[]; employeeId: string; nextIds: string[] }) => {
      return requireDeleteSuccess(
        await rpcClient.employeesSyncManagedProjects({
          employeeId: input.employeeId,
          projectIds: input.nextIds,
        }),
      )
    },
/**
 * useCreateExternalCounterpartyMutation() component.
 */
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { projects: true, employees: true, warehouses: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useSyncManagedWarehousesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "employees", "managed-warehouses"],
    mutationFn: async (input: { currentIds: string[]; employeeId: string; nextIds: string[] }) => {
      return requireDeleteSuccess(
        await rpcClient.employeesSyncManagedWarehouses({
          employeeId: input.employeeId,
          warehouseIds: input.nextIds,
        }),
      )
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { warehouses: true, employees: true, projects: true, externalCounterparties: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useCreateSalaryPaymentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "salary-payments", "create"],
    mutationFn: async (input: {
      employeeId: string
      days?: number
      actualAmountDzd?: number
      projectSplits?: Array<{ projectId: string; days: number }>
      paymentDate?: string
      note?: string | null
    }) => {
      const result = await rpcClient.salaryPaymentsCreate(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { employees: true, debtsSummary: true, debtsDetail: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useCreateExternalCounterpartyMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "external-counterparties", "create"],
    mutationFn: async (input: {
      fullName: string
      phoneNumber: string
      note?: string | null
    }) => {
      const result = await rpcClient.externalCounterpartiesCreate(input)
      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { debtsSummary: true, debtsDetail: true, employees: true, externalCounterparties: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useCreateDebtAccountMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "debts", "accounts", "create"],
    mutationFn: async (input: {
      partyType: "INTERNAL_WORKER" | "EXTERNAL_COUNTERPARTY"
      workerId?: string | null
      externalCounterpartyId?: string | null
      direction?: "PAYABLE" | "RECEIVABLE"
      note?: string | null
      openingBalanceDzd?: number
      openingEntryDate?: string
      openingEntryNote?: string | null
      reasonCategory?: "INVOICE_DRIVEN" | "SALARY_ADVANCE" | "REIMBURSEMENT" | "CASH_TAKE" | "EQUIPMENT_DAMAGE" | "PERSONAL_LOAN" | "DIRECT_LOAN_GIVEN" | "DIRECT_LOAN_TAKEN" | "OTHER"
      reasonDetail?: string | null
    }) => {
      const result = await rpcClient.debtAccountsCreate({
        externalCounterpartyId: input.externalCounterpartyId ?? null,
        // Issue #22: backward-compatible default — purchase-ledger
        // (PAYABLE) accounts keep their pre-#22 behavior. Sale-ledger
        // (RECEIVABLE) accounts will be wired by Issue #26.
        direction: input.direction ?? "PAYABLE",
        note: input.note ?? null,
        openingBalanceDzd: input.openingBalanceDzd ?? 0,
        openingEntryDate: input.openingEntryDate,
        openingEntryNote: input.openingEntryNote ?? null,
        reasonCategory: input.reasonCategory as "INVOICE_DRIVEN" | "SALARY_ADVANCE" | "REIMBURSEMENT" | "CASH_TAKE" | "EQUIPMENT_DAMAGE" | "PERSONAL_LOAN" | "DIRECT_LOAN_GIVEN" | "DIRECT_LOAN_TAKEN" | "OTHER" | undefined,
        reasonDetail: input.reasonDetail ?? null,
        partyType: input.partyType,
        workerId: input.workerId ?? null,
      })

      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { debtsSummary: true, debtsDetail: true, employees: true, externalCounterparties: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useCreateDebtEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "debts", "entries", "create"],
    mutationFn: async (input: {
      debtAccountId: string
      signedAmountDzd: number
      entryDate?: string
      note?: string | null
    }) => {
      const result = await rpcClient.debtEntriesCreate({
        debtAccountId: input.debtAccountId,
        entryDate: input.entryDate,
        entryType: "ADJUSTMENT",
        note: input.note,
        signedAmountDzd: input.signedAmountDzd,
      })

      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { debtsSummary: true, debtsDetail: true, employees: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useRecordDebtPaymentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "debts", "entries", "recordPayment"],
    mutationFn: async (input: {
      debtEntryId: string
      amountDzd: number
      paymentMethod?: "CASH" | "BANK_TRANSFER" | "CHECK"
      note?: string | null
    }) => {
      const result = await rpcClient.debtEntriesRecordPayment({
        debtEntryId: input.debtEntryId,
        amountDzd: input.amountDzd,
        paymentMethod: input.paymentMethod ?? "CASH",
        note: input.note ?? null,
      })

      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { debtsSummary: true, debtsDetail: true, employees: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useVoidDebtEntryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "debts", "entries", "void"],
    mutationFn: async (input: {
      entryId: string
      voidReason: string
    }) => {
      const result = await rpcClient.debtEntriesVoid({
        entryId: input.entryId,
        voidReason: input.voidReason,
      })

      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { debtsSummary: true, debtsDetail: true, employees: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useDebtEntriesConsolidateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "debts", "entries", "consolidate"],
    mutationFn: async (input: {
      payableEntryId: string
      receivableEntryId: string
    }) => {
      const result = await rpcClient.debtEntriesConsolidate({
        payableEntryId: input.payableEntryId,
        receivableEntryId: input.receivableEntryId,
      })

      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { debtsSummary: true, debtsDetail: true, employees: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
    },
  })
}

export function useSettleDebtAccountMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["phase1", "workspace", "debts", "settle"],
    mutationFn: async (input: { debtAccountId: string; entryDate?: string; note?: string | null }) => {
      const result = await rpcClient.debtAccountsSettle({
        id: input.debtAccountId,
        entryDate: input.entryDate,
        note: input.note,
      })

      return requireEntitySuccess(result)
    },
    onSuccess: async ({ message }) => {
      await invalidateWorkspaceDomains(queryClient, getCachedSessionUserId(queryClient), { debtsSummary: true, debtsDetail: true, employees: true })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(error instanceof Error ? error.message : i18n.t("toasts.actionError"))
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

      const workspace = await ensureWorkspace(queryClient, getCachedSessionUserId(queryClient))

      if (section === "employees") {
        throw new Error(i18n.t("toasts.addWorkerError"))
      }

      if (section === "roles") {
        const sequence = nextSequence(workspace.roles.map((role: Role) => role.id), "role-custom-")
        const result = await rpcClient.rolesCreate({
          key: `custom_${sequence}`,
          name: i18n.t("mockData.customRoleName", { count: sequence }),
          description: i18n.t("mockData.customRoleDescription"),
        })
        const success = requireEntitySuccess(result)
        return { message: success.message, section }
      }

      if (section === "projects") {
        const sequence = nextSequence(workspace.projects.map((project: Project) => project.id), "project-")
        const managerId = workspace.projects.find((project: Project) => project.managerId)?.managerId ?? null
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
        const sequence = nextSequence(workspace.warehouses.map((warehouse: Warehouse) => warehouse.id), "warehouse-")
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

      throw new Error(i18n.t("toasts.addError"))
    },
    onSuccess: async ({ message, section }) => {
      const userId = getCachedSessionUserId(queryClient)
      if (section === "roles") {
        await invalidateWorkspaceDomains(queryClient, userId, { roles: true, employees: true })
      } else if (section === "projects") {
        await invalidateWorkspaceDomains(queryClient, userId, { projects: true, employees: true, warehouses: true })
      } else if (section === "warehouses") {
        await invalidateWorkspaceDomains(queryClient, userId, { warehouses: true, employees: true })
      }
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
    onSuccess: async ({ message }, variables) => {
      const userId = getCachedSessionUserId(queryClient)
      if (variables.section === "roles") {
        await invalidateWorkspaceDomains(queryClient, userId, { roles: true, employees: true })
      } else if (variables.section === "employees") {
        await invalidateWorkspaceDomains(queryClient, userId, { employees: true, projects: true, warehouses: true, debtsSummary: true, debtsDetail: true })
      } else if (variables.section === "projects") {
        await invalidateWorkspaceDomains(queryClient, userId, { projects: true, employees: true, warehouses: true })
      } else {
        await invalidateWorkspaceDomains(queryClient, userId, { warehouses: true, employees: true })
      }
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
      // The shell composite reads the single workspaceSnapshot key, so a
      // reset must clear the snapshot namespace too — otherwise the
      // dashboard keeps showing stale data after the reset (issue #276).
      await queryClient.invalidateQueries({ queryKey: workspaceDomainQueryPrefix })
      await queryClient.invalidateQueries({ queryKey: workspaceQueryPrefix })
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
