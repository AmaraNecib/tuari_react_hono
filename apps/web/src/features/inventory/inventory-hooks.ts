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
  InventoryOutboundTransfer,
  InventoryOutboundTransferCreateInput,
  InventoryInvoiceGroupRecordPaymentInput,
  Project,
  Warehouse,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import { desktopApiFetch } from "@/lib/desktop-api-bridge"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { createRpcHeaders, resolveRpcCredentials, rpcClient } from "@/lib/orpc-client"
import { buildErrorMessage } from "@/lib/rpc-error-handling"
import { resolveApiUrl } from "@/lib/runtime-config"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

const inventoryKeys = {
  itemDefinitions: ["inventory", "item-definitions"] as const,
  invoiceGroups: ["inventory", "invoice-groups"] as const,
  invoiceGroup: (invoiceId: string) => ["inventory", "invoice-groups", invoiceId] as const,
  warehouses: ["inventory", "warehouses"] as const,
  projects: ["inventory", "projects"] as const,
  counterparties: ["inventory", "counterparties"] as const,
  asset: (assetId: string) => ["inventory", "asset", assetId] as const,
  locationContents: (input: { warehouseId?: string; projectId?: string }) => ["inventory", "location-contents", input] as const,
  outboundTransfers: ["inventory", "outbound-transfers"] as const,
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

/** Fetches item definitions for the inventory. */
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
    queryKey: inventoryKeys.locationContents(input),
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
    queryKey: inventoryKeys.asset(assetId ?? "missing"),
    enabled: Boolean(assetId),
    queryFn: async (): Promise<InventoryAssetDetail> => {
      const result = await rpcClient.inventoryAssetsGet({ id: assetId! })
      return requireEntitySuccess(result).item
    },
  })
}

/** Fetches warehouses for the inventory. */
export function useInventoryWarehousesQuery(enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.warehouses,
    enabled,
    queryFn: async (): Promise<{ items: Warehouse[] }> => rpcClient.warehousesList(undefined),
  })
}

/** Fetches projects for the inventory. */
export function useInventoryProjectsQuery(enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.projects,
    enabled,
    queryFn: async (): Promise<{ items: Project[] }> => rpcClient.projectsList(undefined),
  })
}

/** Fetches external counterparties. */
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
      showErrorToast(buildErrorMessage(error, "تعذر إنشاء تعريف العنصر."))
    },
  })
}

/** Creates an inventory invoice group. */
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
      showErrorToast(buildErrorMessage(error, "تعذر إنشاء الفاتورة."))
    },
  })
}

/** Transfers an asset between locations. */
export function useTransferInventoryAssetMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "assets", "transfer"],
    mutationFn: async (input: { assetUnitId: string; toWarehouseId?: string | null; toProjectId?: string | null; note?: string | null; occurredAt?: string }) => requireEntitySuccess(await rpcClient.inventoryAssetsTransfer(input)),
    onSuccess: async ({ item, message }) => {
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.asset(item.asset.id) })
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.invoiceGroup(item.invoiceGroup.id) })
      // Invalidate the current location where asset was transferred
      if (item.asset.currentWarehouseId || item.asset.currentProjectId) {
        await queryClient.invalidateQueries({ queryKey: inventoryKeys.locationContents({ warehouseId: item.asset.currentWarehouseId ?? undefined, projectId: item.asset.currentProjectId ?? undefined }) })
      }
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تحويل الأصل."))
    },
  })
}

/** Transfers consumable items between locations. */
export function useTransferInventoryConsumableMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "consumables", "transfer"],
    mutationFn: async (input: { inventoryEntryId: string; quantity: number; fromWarehouseId?: string | null; fromProjectId?: string | null; toWarehouseId?: string | null; toProjectId?: string | null; note?: string | null; occurredAt?: string }) => requireEntitySuccess(await rpcClient.inventoryConsumablesTransfer(input)),
    onSuccess: async ({ message }, variables) => {
      // Invalidate only the affected locations
      const affectedLocations = [
        { warehouseId: variables.fromWarehouseId ?? undefined, projectId: variables.fromProjectId ?? undefined },
        { warehouseId: variables.toWarehouseId ?? undefined, projectId: variables.toProjectId ?? undefined },
      ].filter(loc => loc.warehouseId || loc.projectId)

      for (const location of affectedLocations) {
        await queryClient.invalidateQueries({ queryKey: inventoryKeys.locationContents(location) })
      }
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.invoiceGroups })
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تحويل الكمية."))
    },
  })
}

export async function uploadInvoiceAttachments(invoiceGroupId: string, files: File[]) {
  const response = isDesktopRuntime()
    ? await desktopApiFetch(resolveApiUrl(`/api/inventory/invoice-groups/${invoiceGroupId}/attachments`), {
      authenticated: true,
      method: "POST",
      multipartFiles: await Promise.all(
        files.map(async (file) => ({
          bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
          fieldName: "files",
          fileName: file.name,
          mimeType: file.type || null,
        })),
      ),
    })
    : await fetch(resolveApiUrl(`/api/inventory/invoice-groups/${invoiceGroupId}/attachments`), {
      method: "POST",
      headers: {
        ...createRpcHeaders(),
      },
      credentials: resolveRpcCredentials(),
      body: (() => {
        const formData = new FormData()
        for (const file of files) {
          formData.append("files", file)
        }
        return formData
      })(),
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

export function useOutboundTransfersQuery() {
  return useQuery({
    queryKey: inventoryKeys.outboundTransfers,
    queryFn: async (): Promise<{ items: InventoryOutboundTransfer[] }> => rpcClient.inventoryOutboundTransfersList(undefined),
  })
}

export function useRecordInvoicePaymentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "invoice-groups", "record-payment"],
    mutationFn: async (input: InventoryInvoiceGroupRecordPaymentInput) => requireEntitySuccess(await rpcClient.inventoryInvoiceGroupsRecordPayment(input)),
    onSuccess: async ({ item, message }) => {
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.invoiceGroups })
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.invoiceGroup(item.id) })
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تسجيل الدفع."))
    },
  })
}

export function useCreateOutboundTransferMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "outbound-transfers", "create"],
    mutationFn: async (input: InventoryOutboundTransferCreateInput) => requireEntitySuccess(await rpcClient.inventoryOutboundTransfersCreate(input)),
    onSuccess: async ({ item, message }) => {
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.outboundTransfers })
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر إنشاء التحويل الخارجي."))
    },
  })
}
