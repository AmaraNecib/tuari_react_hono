import "@/i18n"
import i18n from "i18next"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { exactInventoryAssetHistorySchema, exactInventoryLocationSchema, inventoryItemDefinitionSchema } from "@tuari/contracts"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { InventoryLocationContentsSection } from "./inventory-location-contents-section"
import { useCreateInventoryItemDefinitionMutation } from "./inventory-hooks"
import { useExactAssetHistory, useExactInventoryDefinitions } from "./inventory-exact-queries"
import { financialClient } from "@/lib/orpc-client"
import { ProjectDetailsPage } from "@/features/projects/project-details-page"
import { WarehouseDetailsPage } from "@/features/warehouses/warehouse-details-page"
vi.mock("@tanstack/react-router", async original => ({ ...await original<typeof import("@tanstack/react-router")>(), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
const mocks = vi.hoisted(() => ({ owner: "operator",  history: vi.fn(), location: vi.fn(), definitions: vi.fn(), asset: vi.fn(), consumable: vi.fn(), outbound: vi.fn(), create: vi.fn(), legacy: vi.fn(), warehouses: vi.fn(), projects: vi.fn(), parties: vi.fn(), defaults: vi.fn() }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: mocks.owner } } }) }))
vi.mock("@/lib/orpc-client", async original => ({ ...await original<typeof import("@/lib/orpc-client")>(), financialClient: { inventory: { assetHistory: mocks.history, locationContents: mocks.location, definitions: mocks.definitions, transferAsset: mocks.asset, transferConsumable: mocks.consumable, createOutbound: mocks.outbound, chargeDefault: mocks.defaults } }, rpcClient: { inventoryLocationContentsGet: mocks.legacy, inventoryItemDefinitionsCreate: mocks.create, warehousesList: mocks.warehouses, projectsList: mocks.projects, externalCounterpartiesList: mocks.parties } }))
const date = "2026-11-10T00:00:00.000Z"
const material = inventoryItemDefinitionSchema.parse({ id: "material", name: "Cement", itemType: "CONSUMABLE", unit: "kg", isActive: true, description: null, createdAt: date, updatedAt: date })
const pump = inventoryItemDefinitionSchema.parse({ ...material, id: "pump", name: "Pump", itemType: "ASSET", unit: null })
function contents(project = false) { return exactInventoryLocationSchema.parse({ assets: [{ id: "asset", inventoryEntryId: "asset-entry", itemDefinitionId: "pump", assetName: "Pump", assetTag: null, serialNumber: null, condition: null, purchaseDate: null, currentWarehouseId: project ? null : "same", currentProjectId: project ? "same" : null, currentLocationLabel: project ? "Project" : "Warehouse", note: null, purchasePriceDzd: "90071992547409.93", createdAt: date, updatedAt: date }], consumables: [{ id: "balance", inventoryEntryId: "entry", itemDefinitionId: "material", itemName: "Cement", warehouseId: project ? null : "same", projectId: project ? "same" : null, quantity: 3.25, locationLabel: project ? "Project" : "Warehouse", createdAt: date, updatedAt: date }] }) }
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()) })
beforeEach(() => { vi.resetAllMocks(); mocks.owner = "operator"; mocks.location.mockImplementation(async input => contents(Boolean(input.projectId))); mocks.definitions.mockResolvedValue([material, pump]); mocks.warehouses.mockResolvedValue({ items: [{ id: "same", name: "Warehouse" }] }); mocks.projects.mockResolvedValue({ items: [{ id: "same", name: "Project" }] }); mocks.parties.mockResolvedValue({ items: [{ id: "party", fullName: "Supplier", phoneNumber: "0612345678", note: null, createdAt: date, updatedAt: date }] }); mocks.asset.mockResolvedValue({}); mocks.consumable.mockResolvedValue({}); mocks.outbound.mockResolvedValue({}); mocks.defaults.mockResolvedValue({ amountDzd: "0.10", source: "PURCHASE_PRICE" }) })
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } }); clients.push(client); client.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } }); return { client, wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> } }
const t = (key: string) => i18n.t(key)
it.each([false, true])("loads current stock and submits an exact consumable transfer, project=%s", async project => {
 const { wrapper } = setup()
 const record = { id: "same", name: "Location", managerId: null, managerName: "Manager", status: "ACTIVE", notes: null }
 render(project
   ? <ProjectDetailsPage project={{ ...record, location: null, activeWorkers: 0 }} activeTab="items" onTabChange={() => {}} managementHistoryRows={[]} workerRows={[]} />
   : <WarehouseDetailsPage warehouse={{ ...record, address: null }} activeTab="items" onTabChange={() => {}} managementHistoryRows={[]} teamRows={[]} />, { wrapper })
 await screen.findByText("Cement")
 expect(screen.getByText("Pump")).toBeTruthy()
 expect(screen.getByText(/3.25/)).toBeTruthy()
 expect(mocks.location).toHaveBeenCalledWith(project ? { projectId: "same" } : { warehouseId: "same" })
 expect(mocks.legacy).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole("button", { name: t("exactCommerce.movementTitle") }))
 fireEvent.change(screen.getByRole("combobox", { name: t("exactCommerce.destination") }), { target: { value: project ? "WAREHOUSE:same" : "PROJECT:same" } })
 fireEvent.change(screen.getByRole("textbox", { name: t("exactCommerce.transferQuantity") }), { target: { value: "0.000001" } })
 fireEvent.click(screen.getByRole("button", { name: t("exactCommerce.confirmMovement") }))
 await waitFor(() => expect(mocks.consumable).toHaveBeenCalledTimes(1))
 expect(mocks.consumable.mock.calls[0]?.[0]).toMatchObject({ requestId: expect.any(String), inventoryEntryId: "entry", quantity: 0.000001, ...(project ? { fromProjectId: "same", toWarehouseId: "same" } : { fromWarehouseId: "same", toProjectId: "same" }) })
 expect(mocks.consumable.mock.calls[0]?.[0].requestId).not.toBe("pending")
})
it.each([false, true])("moves an exact asset from either mounted scope without converting its cost, project=%s", async project => {
 const { wrapper } = setup()
 render(<InventoryLocationContentsSection {...project ? { projectId: "same" } : { warehouseId: "same" }} />, { wrapper })
 await screen.findByText("Pump")
 expect(screen.getByText("90,071,992,547,409.93")).toBeTruthy()
 fireEvent.click(screen.getByRole("button", { name: t("exactCommerce.movementTitle") }))
 fireEvent.change(screen.getByRole("combobox", { name: t("exactCommerce.selectedStock") }), { target: { value: "asset" } })
 fireEvent.change(screen.getByRole("combobox", { name: t("exactCommerce.destination") }), { target: { value: project ? "WAREHOUSE:same" : "PROJECT:same" } })
 await waitFor(() => expect((screen.getByRole("button", { name: t("exactCommerce.confirmMovement") }) as HTMLButtonElement).disabled).toBe(false))
 fireEvent.click(screen.getByRole("button", { name: t("exactCommerce.confirmMovement") }))
 await waitFor(() => expect(mocks.asset).toHaveBeenCalledTimes(1))
 expect(mocks.asset.mock.calls[0]?.[0]).toMatchObject({ requestId: expect.any(String), assetUnitId: "asset", chargeAmountDzd: undefined, ...(project ? { toWarehouseId: "same" } : { toProjectId: "same" }) })
 expect(mocks.asset.mock.calls[0]?.[0]).not.toHaveProperty("purchasePriceDzd")
})
it("partitions exact asset reads by client, owner and asset without placeholder chains", async () => {
 const { wrapper } = setup()
 mocks.history.mockResolvedValue(chain())
 const first = financialClient.inventory
 const otherHistory = vi.fn().mockResolvedValue(exactInventoryAssetHistorySchema.parse({ assetUnitId: "asset", items: [] }))
 const second = { ...first, assetHistory: otherHistory }
 const { result, rerender } = renderHook(({ client, id }) => useExactAssetHistory(client, id), { wrapper, initialProps: { client: first, id: "asset" as string | null } })
 await waitFor(() => expect(result.current.data?.items).toHaveLength(2))
 rerender({ client: second, id: "asset" })
 expect(result.current.data).toBeUndefined()
 await waitFor(() => expect(result.current.data?.items).toHaveLength(0))
 mocks.owner = "another-owner"
 rerender({ client: first, id: "asset" })
 expect(result.current.data).toBeUndefined()
 await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(2))
 rerender({ client: first, id: null })
 expect(result.current.data).toBeUndefined()
 expect(mocks.history).toHaveBeenCalledTimes(2)
 expect(otherHistory).toHaveBeenCalledTimes(1)
})
// Mounted UI proof with mocked transport, not native or browser verification.
function chain(assetUnitId = "asset") {
 const revision = { id: "rev-1", chargeId: "charge-1", previousAmountDzd: "90071992547409.91", newAmountDzd: "90071992547409.93", reason: "Correction audit", actorUserId: "reviewer", actorLabel: "Auditor", createdAt: "2026-11-10T23:30:45.000Z", revisionSequence: 1, transactionId: "tx-correction" }
 const charge = { id: "charge-1", assetUnitId, projectId: "project-a", projectName: "Project Alpha", movementId: "movement-a", amountDzd: "90071992547409.93", status: "VOID", voidedAt: date, voidReason: "Void audit", voidedBy: "void-operator", createdAt: date, updatedAt: date, placementSequence: 1, revisions: [revision, { ...revision, id: "rev-2", previousAmountDzd: "90071992547409.93", newAmountDzd: null, revisionSequence: 2, reason: "Void revision", transactionId: "tx-void" }] }
 return exactInventoryAssetHistorySchema.parse({ assetUnitId, items: [{ ...charge, id: "charge-2", projectId: "project-b", projectName: "Project Beta", movementId: "movement-b", amountDzd: "0.10", status: "LIVE", placementSequence: 2, voidedAt: null, voidReason: null, voidedBy: null, revisions: [] }, charge] })
}
function mounted(project: boolean) {
 const record = { id: "same", name: "Location", managerId: null, managerName: "Manager", status: "ACTIVE", notes: null }
 return project ? <ProjectDetailsPage project={{ ...record, location: null, activeWorkers: 0 }} activeTab="items" onTabChange={() => {}} managementHistoryRows={[]} workerRows={[]} /> : <WarehouseDetailsPage warehouse={{ ...record, address: null }} activeTab="items" onTabChange={() => {}} managementHistoryRows={[]} teamRows={[]} />
}
it.each([false, true])("mounts a lazy full exact asset chain in detail items, project=%s", async project => {
 const { wrapper } = setup()
 mocks.history.mockResolvedValue(chain())
 render(mounted(project), { wrapper })
 await screen.findByText("Pump")
 expect(mocks.history).not.toHaveBeenCalled()
 const toggle = screen.getByRole("button", { name: t("inventory.chargeHistory.show") })
 fireEvent.click(toggle)
 await screen.findByText(/Project Alpha/)
 expect(toggle.getAttribute("aria-expanded")).toBe("true")
 expect(document.getElementById(toggle.getAttribute("aria-controls")!)?.textContent).toContain("Project Alpha")
 expect(screen.queryByRole("button", { name: t("inventory.chargeHistory.edit") })).toBeNull()
 expect(screen.getByText(/Project Beta/)).toBeTruthy()
 const placements = screen.getAllByRole("article")
 expect(placements).toHaveLength(2)
 expect(placements[0]?.textContent).toContain("Project Beta")
 expect(placements[0]?.textContent).toContain(t("inventory.chargeHistory.live"))
 expect(placements[1]?.textContent).toContain("Project Alpha")
 expect(placements[1]?.textContent).toContain(t("inventory.chargeHistory.voided"))
 const revisions = screen.getAllByRole("listitem")
 expect(revisions).toHaveLength(2)
 expect(revisions[0]?.textContent).toContain("90,071,992,547,409.91")
 expect(revisions[0]?.textContent).toContain("90,071,992,547,409.93")
 expect(revisions[1]?.textContent).toContain(t("inventory.chargeHistory.voided"))
 expect(screen.getByText(/tx-correction/)).toBeTruthy()
 expect(screen.getByText(/void-operator/)).toBeTruthy()
 expect(screen.getByText("0.1")).toBeTruthy()
 expect(revisions[0]?.textContent).toContain("12:30:45")
 expect(revisions[0]?.textContent).toContain("11/11/2026")
 expect(mocks.history.mock.calls).toEqual([[{ assetUnitId: "asset" }]])
 expect(mocks.defaults).not.toHaveBeenCalled()
 expect(mocks.legacy).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.hide") }))
 expect(screen.queryByRole("article")).toBeNull()
 expect(mocks.history).toHaveBeenCalledTimes(1)
})
it("keeps loading, failure, retry and real empty distinct in the mounted page", async () => {
 const { wrapper } = setup()
 let reject!: (reason: Error) => void
 mocks.history.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail })).mockResolvedValueOnce(exactInventoryAssetHistorySchema.parse({ assetUnitId: "asset", items: [] }))
 render(mounted(false), { wrapper })
 await screen.findByText("Pump")
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.show") }))
 expect(await screen.findByRole("status")).toHaveProperty("textContent", t("inventory.chargeHistory.loading"))
 expect(screen.queryByText(t("inventory.chargeHistory.empty"))).toBeNull()
 await act(async () => reject(new Error("missing asset")))
 await screen.findByRole("alert")
 expect(screen.queryByText(t("inventory.chargeHistory.empty"))).toBeNull()
 fireEvent.click(screen.getByRole("button", { name: t("common.retry") }))
 await screen.findByText(t("inventory.chargeHistory.empty"))
 expect(mocks.history.mock.calls).toEqual([[{ assetUnitId: "asset" }], [{ assetUnitId: "asset" }]])
})
it("switches cached A to pending B without showing A's chain", async () => {
 const { wrapper } = setup()
 const location = contents()
 mocks.location.mockResolvedValue({ ...location, assets: [...location.assets, { ...location.assets[0]!, id: "asset-b", assetName: "Crane" }] })
 let resolve!: (value: ReturnType<typeof chain>) => void
 mocks.history.mockImplementationOnce(async () => chain()).mockImplementationOnce(() => new Promise(done => { resolve = done }))
 render(mounted(true), { wrapper })
 await screen.findByText("Crane")
 fireEvent.click(screen.getAllByRole("button", { name: t("inventory.chargeHistory.show") })[0]!)
 await screen.findByText(/Project Alpha/)
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.show") }))
 expect(screen.queryByText(/Project Alpha/)).toBeNull()
 await screen.findByRole("status")
 await act(async () => resolve(exactInventoryAssetHistorySchema.parse({ assetUnitId: "asset-b", items: [] })))
 await screen.findByText(t("inventory.chargeHistory.empty"))
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.show") }))
 await screen.findByText(/Project Alpha/)
 expect(mocks.history.mock.calls).toEqual([[{ assetUnitId: "asset" }], [{ assetUnitId: "asset-b" }]])
})
it("rejects a mismatched history response instead of displaying another asset's chain", async () => {
 const { wrapper } = setup()
 mocks.history.mockResolvedValue(chain("other-asset"))
 render(mounted(false), { wrapper })
 await screen.findByText("Pump")
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.show") }))
 await screen.findByRole("alert")
 expect(screen.queryByText(/Project Alpha/)).toBeNull()
 expect(screen.queryByText(t("inventory.chargeHistory.empty"))).toBeNull()
})
it("has real translations for every history label", () => {
 for (const key of ["show", "hide", "loading", "loadError", "empty", "project", "placement", "live", "voided", "revisions", "unknownActor"]) expect(i18n.exists(`inventory.chargeHistory.${key}`)).toBe(true)
})
it("shows failed history as unavailable, never as an empty chain", async () => {
 mocks.history.mockRejectedValue(new Error("offline"))
 const { wrapper } = setup()
 render(<InventoryLocationContentsSection warehouseId="same" />, { wrapper })
 await screen.findByText("Pump")
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.show") }))
 expect((await screen.findByRole("alert")).textContent).toContain(t("inventory.chargeHistory.loadError"))
 expect(screen.queryByText(t("inventory.chargeHistory.empty"))).toBeNull()
 expect(mocks.legacy).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.hide") }))
 expect(screen.queryByRole("alert")).toBeNull()
})
it("uses the mounted source, producer option and party for an exact outbound valuation", async () => {
 const { wrapper } = setup()
 render(<InventoryLocationContentsSection projectId="same" />, { wrapper })
 await screen.findByText("Cement")
 fireEvent.click(screen.getByRole("button", { name: t("exactCommerce.movementTitle") }))
 fireEvent.change(screen.getByRole("combobox", { name: t("exactCommerce.movementType") }), { target: { value: "SALE" } })
 fireEvent.change(screen.getByRole("combobox", { name: t("exactCommerce.optionalValuation") }), { target: { value: "DERIVED" } })
 fireEvent.change(screen.getByRole("textbox", { name: t("exactCommerce.sourceAgreedTotal") }), { target: { value: "10000" } })
 fireEvent.change(screen.getByRole("textbox", { name: t("exactCommerce.originalSourceQuantity") }), { target: { value: "300" } })
 fireEvent.click(screen.getByRole("button", { name: t("exactCommerce.confirmMovement") }))
 await waitFor(() => expect(mocks.outbound).toHaveBeenCalledTimes(1))
 expect(mocks.outbound.mock.calls[0]?.[0]).toMatchObject({ fromType: "PROJECT", fromId: "same", counterpartyId: "party", items: [{ itemId: "material", optionId: "balance", quantity: 1, derivedPrice: { total: "10000.00", originalQuantity: "300" } }] })
})
it("isolates identical location IDs and never projects loading or failure as empty stock", async () => {
 mocks.location.mockImplementation(() => new Promise(() => {}))
 const { wrapper } = setup()
 const view = render(<InventoryLocationContentsSection warehouseId="same" />, { wrapper })
 expect(screen.getByRole("status").textContent).toBe(t("exactCommerce.loadingStock"))
 expect(screen.queryByText(t("exactCommerce.noStock"))).toBeNull()
 mocks.location.mockRejectedValue(new Error("Unavailable"))
 view.rerender(<InventoryLocationContentsSection projectId="same" />)
 await screen.findByRole("alert")
 expect(screen.queryByText(t("exactCommerce.noStock"))).toBeNull()
 mocks.location.mockResolvedValue({ assets: [], consumables: [] })
 fireEvent.click(screen.getByRole("button", { name: t("common.retry") }))
 await screen.findByText(t("exactCommerce.noStock"))
 expect(mocks.location).toHaveBeenCalledWith({ warehouseId: "same" })
 expect(mocks.location).toHaveBeenCalledWith({ projectId: "same" })
})
it.each([false, true])("refreshes the active exact catalog after creation, missing session cache=%s", async missingSession => {
 mocks.definitions.mockResolvedValue([])
 mocks.create.mockImplementation(async () => { mocks.definitions.mockResolvedValue([material]); return { success: true, item: material, message: "Saved" } })
 const { wrapper, client } = setup()
 if (missingSession) client.removeQueries({ queryKey: sessionQueryKey })
 const { result } = renderHook(() => ({ list: useExactInventoryDefinitions(financialClient.inventory), create: useCreateInventoryItemDefinitionMutation() }), { wrapper })
 await waitFor(() => expect(result.current.list.data).toEqual([]))
 await act(async () => { await result.current.create.mutateAsync({ name: "Cement", itemType: "CONSUMABLE", unit: "kg", description: null }) })
 await waitFor(() => expect(result.current.list.data).toEqual([material]))
 expect(mocks.definitions).toHaveBeenCalledTimes(2)
})
