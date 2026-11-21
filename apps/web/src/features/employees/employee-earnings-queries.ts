import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  AppError,
  EmployeeEarning,
  EmployeeEarningApprovalInput,
  EmployeePayrollAdvanceOffsetInput,
  EmployeePayrollAdvanceRepayInput,
  EmployeePayrollCashRecordInput,
  PayrollOpeningReviewInput,
  PayrollOpeningCorrectInput,
  PayrollOpeningReconcileInput,
  PayrollOpeningCancelInput,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/workspace-mutations"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import {
  getCachedSessionUserId,
  invalidateWorkspaceDomains,
  workspaceQueryKeys,
} from "@/features/app-shell/workspace-keys"
import { rpcClient } from "@/lib/orpc-client"

export const employeeEarningsQueryKeys = {
  root: (userId: string) => ["phase1", "workspace-domain", "employee-earnings", userId] as const,
  list: (userId: string, employeeId?: string) => [
    ...employeeEarningsQueryKeys.root(userId),
    "list",
    employeeId ?? "all",
  ] as const,
  payrollRoot: (userId: string) => ["phase1", "workspace-domain", "employee-payroll", userId] as const,
  opening: (userId: string, employeeId: string) => ["phase1", "workspace-domain", "employee-opening", userId, employeeId] as const,
  payroll: (userId: string, employeeId: string) => [
    ...employeeEarningsQueryKeys.payrollRoot(userId),
    employeeId,
  ] as const,
}

function requireEarning(result: {
  success: boolean
  item?: EmployeeEarning
  error?: Pick<AppError, "message" | "code" | "fieldErrors">
}) {
  if (!result.success || !result.item) {
    throw new AppMutationError({
      message: result.error?.message ?? "تعذر اعتماد الأجر.",
      code: result.error?.code,
      fieldErrors: result.error?.fieldErrors,
    })
  }

  return result.item
}

export function useEmployeeEarningsQuery(employeeId?: string) {
  return useWorkspaceScopedQuery({
    key: (userId) => employeeEarningsQueryKeys.list(userId ?? "anonymous", employeeId),
    queryFn: () => rpcClient.employeeEarningsList(employeeId ? { employeeId } : undefined),
  })
}

export function useEmployeePayrollQuery(employeeId: string) {
  return useWorkspaceScopedQuery({
    key: (userId) => employeeEarningsQueryKeys.payroll(userId ?? "anonymous", employeeId),
    queryFn: () => rpcClient.employeePayrollGet({ employeeId }),
  })
}

export function useEmployeeOpeningQuery(employeeId: string) {
  return useWorkspaceScopedQuery({
    key: userId => employeeEarningsQueryKeys.opening(userId ?? "anonymous", employeeId),
    queryFn: () => rpcClient.employeePayrollOpeningGet({ employeeId }),
  })
}
export function useReviewEmployeeOpeningMutation() {
  return usePayrollMutation("opening-review", (input: PayrollOpeningReviewInput) => rpcClient.employeePayrollOpeningReview(input))
}
export function useCorrectEmployeeOpeningMutation() {
  return usePayrollMutation("opening-correct", (input: PayrollOpeningCorrectInput) => rpcClient.employeePayrollOpeningCorrect(input))
}

export function useReconcileEmployeeOpeningMutation() {
  return usePayrollMutation("opening-reconcile", (input: PayrollOpeningReconcileInput) => rpcClient.employeePayrollOpeningReconcile(input))
}
export function useCancelEmployeeOpeningProposalMutation() {
  return usePayrollMutation("opening-cancel", (input: PayrollOpeningCancelInput) => rpcClient.employeePayrollOpeningCancelProposal(input))
}

function usePayrollMutation<A>(
  mutationKey: string,
  mutationFn: (input: A) => Promise<unknown>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["employee-payroll", mutationKey],
    mutationFn,
    onMutate: () => ({ userId: getCachedSessionUserId(queryClient) }),
    onSuccess: async (_result, input, context) => {
      const userId = context.userId
      if (userId === null) return
      const employeeId = (input as { employeeId: string }).employeeId
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeEarningsQueryKeys.payroll(userId, employeeId) }),
        queryClient.invalidateQueries({ queryKey: employeeEarningsQueryKeys.opening(userId, employeeId) }),
        queryClient.invalidateQueries({ queryKey: employeeEarningsQueryKeys.root(userId) }),
        invalidateWorkspaceDomains(queryClient, userId, { debtsSummary: true, debtAccounts: true, salaryPayments: true }),
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.debtsDetail(userId) }),
        queryClient.invalidateQueries({ predicate: query => {
          const key = query.queryKey
          return key[0] === "phase1" && key[1] === "workspace" && key[2] === "debts-exact" && key[4] === userId
        } }),
      ])
    },
  })
}

export function useRecordEmployeePayrollCashMutation() {
  return usePayrollMutation("cash", (input: EmployeePayrollCashRecordInput) => rpcClient.employeePayrollCashRecord(input))
}

export function useRepayEmployeePayrollAdvanceMutation() {
  return usePayrollMutation("repay", (input: EmployeePayrollAdvanceRepayInput) => rpcClient.employeePayrollAdvanceRepay(input))
}

export function useOffsetEmployeePayrollAdvanceMutation() {
  return usePayrollMutation("offset", (input: EmployeePayrollAdvanceOffsetInput) => rpcClient.employeePayrollAdvanceOffset(input))
}

export function useApproveEmployeeEarningMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["employee-earnings", "approve"],
    mutationFn: async (input: EmployeeEarningApprovalInput) =>
      requireEarning(await rpcClient.employeeEarningsApprove(input)),
    onMutate: () => ({ userId: getCachedSessionUserId(queryClient) }),
    onSuccess: async (_earning, input, context) => {
      const userId = context.userId
      if (userId === null) {
        return
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeEarningsQueryKeys.root(userId) }),
        invalidateWorkspaceDomains(queryClient, userId, { employees: true }),
        queryClient.invalidateQueries({ queryKey: employeeEarningsQueryKeys.payroll(userId, input.employeeId) }),
        ...[...new Set(input.segments.map((segment) => segment.projectId))].map((projectId) =>
          queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.projectCost(userId, projectId) }),
        ),
      ])
    },
  })
}
