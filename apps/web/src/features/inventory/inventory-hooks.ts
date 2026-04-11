import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AppError,
  InventoryAssetDetail,
  ExternalCounterparty,
  InventoryLocationContents,
  InventoryInvoiceGroupDetail,
  InventoryInvoiceGroupCreateInput,
  InventoryInvoiceGroup,
  InventoryItemDefinition,
  InventoryItemDefinitionCreateInput,
  Project,
  Warehouse,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import { createRpcHeaders, resolveRpcCredentials, rpcClient } from "@/lib/orpc-client"
import { resolveApiUrl } from "@/lib/runtime-config"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

const inventoryKeys = {
  itemDefinitions: ["inventory", "item-definitions"] as const,
  invoiceGroups: ["inventory", "invoice-groups"] as const,
  invoiceGroup: (invoiceId: string) => ["inventory", "invoice-groups", invoiceId] as const,
  warehouses: ["inventory", "warehouses"] as const,
  projects: ["inventory", "projects"] as const,
  counterparties: ["inventory", "counterparties"] as const,
}

function extractRpcIssueMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0 && error.message !== "Input validation failed") {
    return error.message
  }

  if (typeof error === "object" && error !== null) {
    const directData = Reflect.get(error, "data")

    if (typeof directData === "object" && directData !== null) {
      const issues = Reflect.get(directData, "issues")
      if (Array.isArray(issues) && issues.length > 0) {
        const firstIssue = issues[0]
        if (typeof firstIssue === "object" && firstIssue !== null) {
          const message = Reflect.get(firstIssue, "message")
          if (typeof message === "string" && message.trim().length > 0) {
            return message
          }
        }
      }
    }
  }

  return null
}

function getInventoryErrorMessage(error: unknown, fallbackMessage: string) {
  return extractRpcIssueMessage(error) ?? (error instanceof Error && error.message.trim().length > 0 ? error.message : fallbackMessage)
}

function requireEntitySuccess<T>(result: { success: boolean; message?: string; item?: T; error?: { message: string; code?: AppError["code"]; fieldErrors?: Array<{ field: string; message: string }> } }) {
  if (!result.success || !result.item) {
    throw new AppMutationError({
      message: result.error?.message ?? "تعذر تنفيذ العملية.",
      code: result.error?.code,
      fieldErrors: result.error?.fieldErrors,
    })
  }

  return { item: result.item, message: result.message ?? "تم الحفظ بنجاح." }
}

export function useInventoryItemDefinitionsQuery() {
  return useQuery({
    queryKey: inventoryKeys.itemDefinitions,
    queryFn: async (): Promise<{ items: InventoryItemDefinition[] }> => rpcClient.inventoryItemDefinitionsList(undefined),
  })
}

export function useInventoryInvoiceGroupsQuery() {
  return useQuery({
    queryKey: inventoryKeys.invoiceGroups,
    queryFn: async (): Promise<{ items: InventoryInvoiceGroup[] }> => rpcClient.inventoryInvoiceGroupsList(undefined),
  })
}

export function useInventoryInvoiceGroupQuery(invoiceId: string | undefined) {
  return useQuery({
    queryKey: inventoryKeys.invoiceGroup(invoiceId ?? "missing"),
    enabled: Boolean(invoiceId),
    queryFn: async (): Promise<InventoryInvoiceGroupDetail> => {
      const result = await rpcClient.inventoryInvoiceGroupsGet({ id: invoiceId! })
      return requireEntitySuccess(result).item
    },
  })
}

export function useInventoryLocationContentsQuery(input: { warehouseId?: string; projectId?: string }) {
  return useQuery({
    queryKey: ["inventory", "location-contents", input],
    enabled: Boolean(input.warehouseId || input.projectId),
    queryFn: async (): Promise<InventoryLocationContents> => {
      const result = await rpcClient.inventoryLocationContentsGet({
        warehouseId: input.warehouseId ?? null,
        projectId: input.projectId ?? null,
      })
      return requireEntitySuccess(result).item
    },
  })
}

export function useInventoryAssetQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: ["inventory", "asset", assetId],
    enabled: Boolean(assetId),
    queryFn: async (): Promise<InventoryAssetDetail> => {
      const result = await rpcClient.inventoryAssetsGet({ id: assetId! })
      return requireEntitySuccess(result).item
    },
  })
}

export function useInventoryWarehousesQuery() {
  return useQuery({
    queryKey: inventoryKeys.warehouses,
    queryFn: async (): Promise<{ items: Warehouse[] }> => rpcClient.warehousesList(undefined),
  })
}

export function useInventoryProjectsQuery() {
  return useQuery({
    queryKey: inventoryKeys.projects,
    queryFn: async (): Promise<{ items: Project[] }> => rpcClient.projectsList(undefined),
  })
}

export function useInventoryExternalCounterpartiesQuery() {
  return useQuery({
    queryKey: inventoryKeys.counterparties,
    queryFn: async (): Promise<{ items: ExternalCounterparty[] }> => rpcClient.externalCounterpartiesList(undefined),
  })
}

export function useCreateInventoryItemDefinitionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "item-definitions", "create"],
    mutationFn: async (input: InventoryItemDefinitionCreateInput) => requireEntitySuccess(await rpcClient.inventoryItemDefinitionsCreate(input)),
    onSuccess: async ({ message }) => {
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.itemDefinitions })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(getInventoryErrorMessage(error, "تعذر إنشاء تعريف العنصر."))
    },
  })
}

export function useCreateInventoryInvoiceGroupMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "invoice-groups", "create"],
    mutationFn: async (input: InventoryInvoiceGroupCreateInput) => requireEntitySuccess(await rpcClient.inventoryInvoiceGroupsCreate(input)),
    onSuccess: async ({ item, message }) => {
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.invoiceGroups })
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.invoiceGroup(item.group.id) })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(getInventoryErrorMessage(error, "تعذر إنشاء الفاتورة."))
    },
  })
}

export function useTransferInventoryAssetMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "assets", "transfer"],
    mutationFn: async (input: { assetUnitId: string; toWarehouseId?: string | null; toProjectId?: string | null; note?: string | null; occurredAt?: string }) => requireEntitySuccess(await rpcClient.inventoryAssetsTransfer(input)),
    onSuccess: async ({ item, message }) => {
      await queryClient.invalidateQueries({ queryKey: ["inventory"] })
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(getInventoryErrorMessage(error, "تعذر تحويل الأصل."))
    },
  })
}

export function useTransferInventoryConsumableMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "consumables", "transfer"],
    mutationFn: async (input: { inventoryEntryId: string; quantity: number; fromWarehouseId?: string | null; fromProjectId?: string | null; toWarehouseId?: string | null; toProjectId?: string | null; note?: string | null; occurredAt?: string }) => requireEntitySuccess(await rpcClient.inventoryConsumablesTransfer(input)),
    onSuccess: async ({ message }) => {
      await queryClient.invalidateQueries({ queryKey: ["inventory"] })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(getInventoryErrorMessage(error, "تعذر تحويل الكمية."))
    },
  })
}

export async function uploadInvoiceAttachments(invoiceGroupId: string, files: File[]) {
  const formData = new FormData()
  for (const file of files) {
    formData.append("files", file)
  }

  const response = await fetch(resolveApiUrl(`/api/inventory/invoice-groups/${invoiceGroupId}/attachments`), {
    method: "POST",
    headers: {
      ...createRpcHeaders(),
    },
    credentials: resolveRpcCredentials(),
    body: formData,
  })

  const body = (await response.json().catch(() => null)) as
    | { success: true; items: unknown[] }
    | { success: false; error?: { message?: string } }
    | null

  if (!response.ok || !body || body.success === false) {
    throw new Error(body && "error" in body && body.error?.message ? body.error.message : "تعذر رفع ملفات الفاتورة.")
  }

  return body.items
}
