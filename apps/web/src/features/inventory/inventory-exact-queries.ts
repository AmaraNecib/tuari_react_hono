import type { ExactInventoryClient, ExactInventoryInvoiceInput, ExactInventoryPayment, ExactInventoryAssetTransfer, ExactInventoryConsumableTransfer, ExactInventoryOutboundInput, ExactInventoryChargeUpdate, ExactInventoryChargeVoid } from "@tuari/contracts"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { exactCommercePrefix, useExactCommerceMutation } from "@/features/shared/exact-commerce-queries"
export type ExactInventoryAction =
  | { kind: "createInvoice"; input: ExactInventoryInvoiceInput }
  | { kind: "recordPayment"; input: ExactInventoryPayment }
  | { kind: "transferAsset"; input: ExactInventoryAssetTransfer }
  | { kind: "transferConsumable"; input: ExactInventoryConsumableTransfer }
  | { kind: "createOutbound"; input: ExactInventoryOutboundInput }
  | { kind: "updateCharge"; input: ExactInventoryChargeUpdate }
  | { kind: "voidCharge"; input: ExactInventoryChargeVoid }
export function useExactInventoryInvoices(client: ExactInventoryClient) {
  return useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "invoices"], queryFn: () => client.listInvoices() })
}
export function useExactInventoryDefinitions(client: ExactInventoryClient) {
  return useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "definitions"], queryFn: () => client.definitions() })
}
export function useExactInventoryDetail(client: ExactInventoryClient, id: string | null) {
  return useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "invoice", id], enabled: id !== null,
    queryFn: () => { if (!id) throw new Error("Select an inventory invoice"); return client.getInvoice({ id }) } })
}
export function useExactInventoryLocation(client: ExactInventoryClient, location: { warehouseId?: string; projectId?: string } | null) {
  return useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "location", location], enabled: location !== null,
    queryFn: () => { if (!location) throw new Error("Select an inventory location"); return client.locationContents(location) } })
}
export function useExactInventoryOutbounds(client: ExactInventoryClient) {
  return useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "outbounds"], queryFn: () => client.listOutbounds() })
}
export function useExactProjectContribution(client: ExactInventoryClient, projectId: string | null) {
  return useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "contribution", projectId], enabled: projectId !== null,
    queryFn: () => { if (!projectId) throw new Error("Select a project"); return client.projectContribution({ projectId }) } })
}
export function useExactProjectCharges(client: ExactInventoryClient, projectId: string | null) {
  return useWorkspaceScopedQuery({ key: owner => [...exactCommercePrefix(client), owner, "charges", projectId], enabled: projectId !== null,
    queryFn: () => { if (!projectId) throw new Error("Select a project"); return client.projectCharges({ projectId }) } })
}
export function useExactInventoryAction(client: ExactInventoryClient) {
  return useExactCommerceMutation<ExactInventoryAction, unknown>(client, command => {
    switch (command.kind) {
      case "createInvoice": return client.createInvoice(command.input)
      case "recordPayment": return client.recordPayment(command.input)
      case "transferAsset": return client.transferAsset(command.input)
      case "transferConsumable": return client.transferConsumable(command.input)
      case "createOutbound": return client.createOutbound(command.input)
      case "updateCharge": return client.updateCharge(command.input)
      case "voidCharge": return client.voidCharge(command.input)
    }
  })
}
