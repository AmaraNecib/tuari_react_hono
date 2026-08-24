/**
 * Mock dashboard exports for development.
 * Re-exports workspace mutations and queries.
 */
export {
  authSetupStatusQueryKey,
  AppMutationError,
  useAddWorkspaceRecordMutation,
  useAuthSetupStatusQuery,
  useBootstrapFirstUserMutation,
  useCreateDebtAccountMutation,
  useCreateDebtEntryMutation,
  useCreateEmployeesBatchMutation,
  useCreateExternalCounterpartyMutation,
  useCreateProjectMutation,
  useCreateSalaryPaymentMutation,
  useCreateWarehouseMutation,
  useDeleteEmployeeMutation,
  useDemoSessionQuery,
  useDemoSignInMutation,
  useDemoSignOutMutation,
  useLeaveEmployeeMutation,
  useRemoveWorkspaceRecordMutation,
  useResetWorkspaceMutation,
  useDebtEntriesConsolidateMutation,
  useRecordDebtPaymentMutation,
  useSettleDebtAccountMutation,
  useVoidDebtEntryMutation,
  useSyncManagedProjectsMutation,
  useSyncManagedWarehousesMutation,
  useSaveEmployeeMutation,
  useUpdateAccountSettingsMutation,
  useUpdateEmployeeMutation,
  useUpdateEmployeeWorkplaceMutation,
  useUpdateProjectMutation,
  useUpdateWarehouseMutation,
  type DemoEmployee,
  type DemoSession,
  type EmployeeBatchCreateResult,
  type SectionKey,
} from "./workspace-mutations"

export {
  workspaceDomainQueryPrefix,
  workspaceQueryKeys,
} from "./workspace-keys"

export {
  demoWorkspaceQueryKey,
  useDemoWorkspaceQuery,
  useCompositeWorkspaceQuery,
  useSystemLogQuery,
  workspaceQueryPrefix,
  type DemoWorkspace,
} from "./workspace-queries"
