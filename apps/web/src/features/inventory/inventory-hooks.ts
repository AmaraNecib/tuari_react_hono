import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import type {
  AppError,
  InventoryAssetChargeDefault,
  InventoryAssetChargeDetail,
  InventoryAssetChargeUpdateInput,
  InventoryAssetChargeVoidInput,
  InventoryAssetDetail,
  ExternalCounterparty,
  InventoryLocationContents,
  InventoryInvoiceGroupDetail,
  InventoryInvoiceGroupCreateInput,
  InventoryInvoiceGroup,
  InventoryItemDefinition,
  InventoryItemDefinitionCreateInput,
  InventoryItemUsage,
  InventoryOutboundTransfer,
  InventoryOutboundTransferCreateInput,
  InventoryInvoiceGroupRecordPaymentInput,
  InventoryProjectCharges,
  Project,
  Warehouse,
} from "@tuari/contracts"

import { AppMutationError } from "@/features/app-shell/mock-dashboard"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { useSessionQuery } from "@/features/session/use-session-query"
import {
  getCachedSessionUserId,
  invalidateUserScopedQuery,
  workspaceQueryKeys,
} from "@/features/app-shell/workspace-keys"
import { desktopApiFetch } from "@/lib/desktop-api-bridge"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { createRpcHeaders, resolveRpcCredentials, rpcClient } from "@/lib/orpc-client"
import { buildErrorMessage } from "@/lib/rpc-error-handling"
import { resolveApiUrl } from "@/lib/runtime-config"
import { showErrorToast, showSuccessToast } from "@/lib/toast"

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

/**
 * Fetches item definitions for the inventory.
 *
 * This is the UNPAGED catalog read. Pickers that must page a usage-scoped set
 * use {@link useItemDefinitionOptionsQuery} instead.
 */
export function useInventoryItemDefinitionsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.inventoryItems,
    enabled,
    queryFn: async (): Promise<{ items: InventoryItemDefinition[] }> => rpcClient.inventoryItemDefinitionsList(undefined),
  })
}

/** Page size for the paged item-option picker. */
export const ITEM_DEFINITION_OPTIONS_PAGE_SIZE = 20

/** A stable query-key fingerprint for a usage. */
function itemUsageKey(usage: InventoryItemUsage): string {
  return usage.surface === "INVOICE_LINE" ? `INVOICE_LINE:${usage.kind}` : "STOCK_REFERENCE"
}

/** Debounces a rapidly changing value (the picker's search box). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/**
 * The single web module that owns the usage-scoped item picker's read:
 * debounce, the cursor chain, page accumulation, and resolving a selection that
 * is not on the current page. Keyed under the existing `inventoryItems` prefix
 * so the create/update invalidations already in place reach every search and
 * page variant.
 */
export function useItemDefinitionOptionsQuery({
  usage,
  search,
  enabled = true,
}: {
  usage: InventoryItemUsage
  search?: string
  enabled?: boolean
}) {
  const sessionQuery = useSessionQuery()
  const userId = sessionQuery.data?.user?.id ?? null
  const debouncedSearch = useDebouncedValue(search?.trim() ?? "", 250)

  const query = useInfiniteQuery({
    queryKey: [
      ...workspaceQueryKeys.inventoryItems(userId),
      "options",
      itemUsageKey(usage),
      debouncedSearch,
    ] as const,
    enabled: Boolean(sessionQuery.data?.user) && enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      rpcClient.inventoryItemDefinitionOptions({
        usage,
        search: debouncedSearch || undefined,
        cursor: pageParam,
        limit: ITEM_DEFINITION_OPTIONS_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const options = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )

  // Note: there is deliberately no `resolve(id)` here yet. The caller (the
  // invoice row) holds the picked OPTION in its state, so a selection that is
  // not on the current page is rendered from that object, not re-fetched. An
  // id-only hydration path (editing an existing invoice) would add `resolve`
  // here then — not speculatively now.
  return { ...query, options, debouncedSearch }
}

/**
 * useInventoryInvoiceGroupsQuery() component.
 */
export function useInventoryInvoiceGroupsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.inventoryInvoices,
    enabled,
    queryFn: async (): Promise<{ items: InventoryInvoiceGroup[] }> => rpcClient.inventoryInvoiceGroupsList(undefined),
/**
 * useInventoryInvoiceGroupQuery(invoiceId component.
 */
  })
}

/** useInventoryInvoiceGroupQuery. */
export function useInventoryInvoiceGroupQuery(invoiceId: string | undefined) {
  return useWorkspaceScopedQuery({
    key: (userId) => workspaceQueryKeys.inventoryInvoiceGroup(userId, invoiceId ?? "missing"),
    enabled: Boolean(invoiceId),
    queryFn: async (): Promise<InventoryInvoiceGroupDetail> => {
/**
 * useInventoryLocationContentsQuery(input component.
 */
      const result = await rpcClient.inventoryInvoiceGroupsGet({ id: invoiceId! })
      return requireEntitySuccess(result).item
    },
  })
}

/** useInventoryLocationContentsQuery. */
export function useInventoryLocationContentsQuery(input: { warehouseId?: string; projectId?: string }) {
  return useWorkspaceScopedQuery({
    key: (userId) => workspaceQueryKeys.inventoryLocationContents(userId, input),
    enabled: Boolean(input.warehouseId || input.projectId),
    queryFn: async (): Promise<InventoryLocationContents> => {
/**
 * useInventoryAssetQuery(assetId component.
 */
      const result = await rpcClient.inventoryLocationContentsGet({
        warehouseId: input.warehouseId ?? null,
        projectId: input.projectId ?? null,
      })
      return requireEntitySuccess(result).item
    },
  })
}

/**
 * useInventoryWarehousesQuery(enabled = true) component.
 */
export function useInventoryAssetQuery(assetId: string | undefined) {
  return useWorkspaceScopedQuery({
    key: (userId) => workspaceQueryKeys.inventoryAsset(userId, assetId ?? "missing"),
    enabled: Boolean(assetId),
    queryFn: async (): Promise<InventoryAssetDetail> => {
      const result = await rpcClient.inventoryAssetsGet({ id: assetId! })
/**
 * useInventoryProjectsQuery(enabled = true) component.
 */
      return requireEntitySuccess(result).item
    },
  })
}

/** Fetches warehouses for the inventory. */
export function useInventoryWarehousesQuery(enabled = true) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.warehouses,
    enabled,
    queryFn: async (): Promise<{ items: Warehouse[] }> => rpcClient.warehousesList(undefined),
  })
}
/**
 * useCreateInventoryItemDefinitionMutation() component.
 */

/** Fetches projects for the inventory. */
export function useInventoryProjectsQuery(enabled = true) {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.projects,
    enabled,
    queryFn: async (): Promise<{ items: Project[] }> => rpcClient.projectsList(undefined),
  })
}

/** Fetches external counterparties. */
export function useInventoryExternalCounterpartiesQuery() {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.externalCounterparties,
/**
 * useCreateInventoryInvoiceGroupMutation() component.
 */
    queryFn: async (): Promise<{ items: ExternalCounterparty[] }> => rpcClient.externalCounterpartiesList(undefined),
  })
}

/** useCreateInventoryItemDefinitionMutation. */
export function useCreateInventoryItemDefinitionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "item-definitions", "create"],
    mutationFn: async (input: InventoryItemDefinitionCreateInput) => requireEntitySuccess(await rpcClient.inventoryItemDefinitionsCreate(input)),
    onSuccess: async ({ message }) => {
      await invalidateUserScopedQuery(queryClient, getCachedSessionUserId(queryClient), workspaceQueryKeys.inventoryItems)
      showSuccessToast(message)
    },
    onError: (error) => {
/**
 * useTransferInventoryAssetMutation() component.
 */
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
    onSuccess: async ({ item, message }, variables) => {
      const userId = getCachedSessionUserId(queryClient)
      await invalidateUserScopedQuery(queryClient, userId, workspaceQueryKeys.inventoryInvoices)
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryInvoiceGroup(uid, item.group.id))
      // A purchase of ASSETs placed directly on a project books a placement
      // charge in the same transaction, so every affected project's charges
      // query must refetch or the cached total stays stale (#422 round 4).
      const affectedProjectIds = new Set<string>()
      if (variables.projectId) affectedProjectIds.add(variables.projectId)
      for (const entry of variables.entries) {
        if (entry.projectId) affectedProjectIds.add(entry.projectId)
      }
      for (const projectId of affectedProjectIds) {
        await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryProjectCharges(uid, projectId))
      }
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر إنشاء الفاتورة."))
    },
/**
 * useTransferInventoryConsumableMutation() component.
 */
  })
}

/** Transfers an asset between locations. */
export function useTransferInventoryAssetMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "assets", "transfer"],
    mutationFn: async (input: { assetUnitId: string; toWarehouseId?: string | null; toProjectId?: string | null; chargeAmountDzd?: number | null; note?: string | null; occurredAt?: string }) => requireEntitySuccess(await rpcClient.inventoryAssetsTransfer(input)),
    onSuccess: async ({ item, message }, variables) => {
      const userId = getCachedSessionUserId(queryClient)
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryAsset(uid, item.asset.id))
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryInvoiceGroup(uid, item.invoiceGroup.id))
      // The placement charge changed the unit's chain and the project's total.
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryAssetCharges(uid, item.asset.id))
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryAssetChargeDefault(uid, item.asset.id))
      if (variables.toProjectId) {
        await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryProjectCharges(uid, variables.toProjectId!))
      }
      // Invalidate the current location where asset was transferred
      if (item.asset.currentWarehouseId || item.asset.currentProjectId) {
        await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryLocationContents(uid, { warehouseId: item.asset.currentWarehouseId ?? undefined, projectId: item.asset.currentProjectId ?? undefined }))
      }
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تحويل الأصل."))
    },
  })
}

/** Resolves the prefill amount for a project placement (#413). */
export function useAssetChargeDefaultQuery(assetUnitId: string | undefined) {
  return useWorkspaceScopedQuery({
    key: (userId) => workspaceQueryKeys.inventoryAssetChargeDefault(userId, assetUnitId ?? "missing"),
    enabled: Boolean(assetUnitId),
    // Revalidate whenever the dialog opens (the query re-enables): another tab
    // can correct the unit's last charge while this tab's cached default is
    // still inside the global 30s window, and a stale prefill would book the
    // wrong amount. `staleTime: 0` makes the disabled→enabled transition
    // refetch; `refetchOnMount` covers a remount of the observer (#422 round 5).
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<InventoryAssetChargeDefault> => {
      const result = await rpcClient.inventoryAssetChargeDefault({ assetUnitId: assetUnitId! })
      return requireEntitySuccess(result).item
    },
  })
}

/** A unit's charge chain, newest first (#413). */
export function useAssetChargesByUnitQuery(assetUnitId: string | undefined) {
  return useWorkspaceScopedQuery({
    key: (userId) => workspaceQueryKeys.inventoryAssetCharges(userId, assetUnitId ?? "missing"),
    enabled: Boolean(assetUnitId),
    queryFn: async (): Promise<{ items: InventoryAssetChargeDetail[] }> => rpcClient.inventoryAssetChargesListByUnit({ assetUnitId: assetUnitId! }),
  })
}

/** A project's live charges plus their total — consumed by the project cost view (#414). */
export function useProjectChargesQuery(projectId: string | undefined) {
  return useWorkspaceScopedQuery({
    key: (userId) => workspaceQueryKeys.inventoryProjectCharges(userId, projectId ?? "missing"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<InventoryProjectCharges> => {
      const result = await rpcClient.inventoryAssetChargesListByProject({ projectId: projectId! })
      return requireEntitySuccess(result).item
    },
  })
}

/** Corrects a past charge; the revision keeps from → to + reason (#413). */
export function useUpdateAssetChargeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "asset-charges", "update"],
    mutationFn: async (input: InventoryAssetChargeUpdateInput) => requireEntitySuccess(await rpcClient.inventoryAssetChargesUpdate(input)),
    onSuccess: async ({ item, message }) => {
      const userId = getCachedSessionUserId(queryClient)
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryAssetCharges(uid, item.assetUnitId))
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryProjectCharges(uid, item.projectId))
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryAssetChargeDefault(uid, item.assetUnitId))
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تصحيح الاحتساب."))
    },
  })
}

/** Voids a past charge while keeping its history (#413). */
export function useVoidAssetChargeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "asset-charges", "void"],
    mutationFn: async (input: InventoryAssetChargeVoidInput) => requireEntitySuccess(await rpcClient.inventoryAssetChargesVoid(input)),
    onSuccess: async ({ item, message }) => {
      const userId = getCachedSessionUserId(queryClient)
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryAssetCharges(uid, item.assetUnitId))
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryProjectCharges(uid, item.projectId))
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryAssetChargeDefault(uid, item.assetUnitId))
      showSuccessToast(message)
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر إلغاء الاحتساب."))
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
      const userId = getCachedSessionUserId(queryClient)
      // Invalidate only the affected locations
      const affectedLocations = [
        { warehouseId: variables.fromWarehouseId ?? undefined, projectId: variables.fromProjectId ?? undefined },
        { warehouseId: variables.toWarehouseId ?? undefined, projectId: variables.toProjectId ?? undefined },
      ].filter(loc => loc.warehouseId || loc.projectId)

      for (const location of affectedLocations) {
        await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryLocationContents(uid, location))
      }
      await invalidateUserScopedQuery(queryClient, userId, workspaceQueryKeys.inventoryInvoices)
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
/**
 * useOutboundTransfersQuery() component.
 */
        })),
      ),
    })
    : await fetch(resolveApiUrl(`/api/inventory/invoice-groups/${invoiceGroupId}/attachments`), {
/**
 * useRecordInvoicePaymentMutation() component.
 */
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
/**
 * useCreateOutboundTransferMutation() component.
 */
    | { success: true; items: unknown[] }
    | { success: false; error?: { message?: string } }
    | null

  if (!response.ok || !body || body.success === false) {
    throw new Error(body && "error" in body && body.error?.message ? body.error.message : "تعذر رفع ملفات الفاتورة.")
  }

  return body.items
}

/** useOutboundTransfersQuery. */
export function useOutboundTransfersQuery() {
  return useWorkspaceScopedQuery({
    key: workspaceQueryKeys.inventoryOutboundTransfers,
    queryFn: async (): Promise<{ items: InventoryOutboundTransfer[] }> => rpcClient.inventoryOutboundTransfersList(undefined),
  })
}

/** useRecordInvoicePaymentMutation. */
export function useRecordInvoicePaymentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "invoice-groups", "record-payment"],
    mutationFn: async (input: InventoryInvoiceGroupRecordPaymentInput) => requireEntitySuccess(await rpcClient.inventoryInvoiceGroupsRecordPayment(input)),
    onSuccess: async ({ item, message }) => {
      const userId = getCachedSessionUserId(queryClient)
      await invalidateUserScopedQuery(queryClient, userId, workspaceQueryKeys.inventoryInvoices)
      await invalidateUserScopedQuery(queryClient, userId, (uid) => workspaceQueryKeys.inventoryInvoiceGroup(uid, item.id))
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر تسجيل الدفع."))
    },
  })
}

/** useCreateOutboundTransferMutation. */
export function useCreateOutboundTransferMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["inventory", "outbound-transfers", "create"],
    mutationFn: async (input: InventoryOutboundTransferCreateInput) => requireEntitySuccess(await rpcClient.inventoryOutboundTransfersCreate(input)),
    onSuccess: async ({ item, message }) => {
      await invalidateUserScopedQuery(queryClient, getCachedSessionUserId(queryClient), workspaceQueryKeys.inventoryOutboundTransfers)
      showSuccessToast(message)
      return item
    },
    onError: (error) => {
      showErrorToast(buildErrorMessage(error, "تعذر إنشاء التحويل الخارجي."))
    },
  })
}
