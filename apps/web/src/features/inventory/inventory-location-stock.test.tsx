import "@/i18n"
import i18n from "i18next"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { exactInventoryLocationSchema, inventoryItemDefinitionSchema } from "@tuari/contracts"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { InventoryLocationContentsSection } from "./inventory-location-contents-section"
import { useCreateInventoryItemDefinitionMutation } from "./inventory-hooks"
import { useExactInventoryDefinitions } from "./inventory-exact-queries"
import { financialClient } from "@/lib/orpc-client"
import { ProjectDetailsPage } from "@/features/projects/project-details-page"
import { WarehouseDetailsPage } from "@/features/warehouses/warehouse-details-page"
vi.mock("@tanstack/react-router", async original => ({ ...await original<typeof import("@tanstack/react-router")>(), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
const mocks = vi.hoisted(() => ({ location: vi.fn(), definitions: vi.fn(), asset: vi.fn(), consumable: vi.fn(), outbound: vi.fn(), create: vi.fn(), legacy: vi.fn(), warehouses: vi.fn(), projects: vi.fn(), parties: vi.fn(), defaults: vi.fn() }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
vi.mock("@/lib/orpc-client", async original => ({ ...await original<typeof import("@/lib/orpc-client")>(), financialClient: { inventory: { locationContents: mocks.location, definitions: mocks.definitions, transferAsset: mocks.asset, transferConsumable: mocks.consumable, createOutbound: mocks.outbound, chargeDefault: mocks.defaults } }, rpcClient: { inventoryLocationContentsGet: mocks.legacy, inventoryItemDefinitionsCreate: mocks.create, warehousesList: mocks.warehouses, projectsList: mocks.projects, externalCounterpartiesList: mocks.parties } }))
const date = "2026-11-10T00:00:00.000Z"
const material = inventoryItemDefinitionSchema.parse({ id: "material", name: "Cement", itemType: "CONSUMABLE", unit: "kg", isActive: true, description: null, createdAt: date, updatedAt: date })
const pump = inventoryItemDefinitionSchema.parse({ ...material, id: "pump", name: "Pump", itemType: "ASSET", unit: null })
function contents(project = false) { return exactInventoryLocationSchema.parse({ assets: [{ id: "asset", inventoryEntryId: "asset-entry", itemDefinitionId: "pump", assetName: "Pump", assetTag: null, serialNumber: null, condition: null, purchaseDate: null, currentWarehouseId: project ? null : "same", currentProjectId: project ? "same" : null, currentLocationLabel: project ? "Project" : "Warehouse", note: null, purchasePriceDzd: "90071992547409.93", createdAt: date, updatedAt: date }], consumables: [{ id: "balance", inventoryEntryId: "entry", itemDefinitionId: "material", itemName: "Cement", warehouseId: project ? null : "same", projectId: project ? "same" : null, quantity: 3.25, locationLabel: project ? "Project" : "Warehouse", createdAt: date, updatedAt: date }] }) }
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()) })
beforeEach(() => { vi.resetAllMocks(); mocks.location.mockImplementation(async input => contents(Boolean(input.projectId))); mocks.definitions.mockResolvedValue([material, pump]); mocks.warehouses.mockResolvedValue({ items: [{ id: "same", name: "Warehouse" }] }); mocks.projects.mockResolvedValue({ items: [{ id: "same", name: "Project" }] }); mocks.parties.mockResolvedValue({ items: [{ id: "party", fullName: "Supplier", phoneNumber: "0612345678", note: null, createdAt: date, updatedAt: date }] }); mocks.asset.mockResolvedValue({}); mocks.consumable.mockResolvedValue({}); mocks.outbound.mockResolvedValue({}); mocks.defaults.mockResolvedValue({ amountDzd: "0.10", source: "PURCHASE_PRICE" }) })
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
it("preserves the asset history affordance with an explicit unavailable state, not a false empty chain", async () => {
 const { wrapper } = setup()
 render(<InventoryLocationContentsSection warehouseId="same" />, { wrapper })
 await screen.findByText("Pump")
 fireEvent.click(screen.getByRole("button", { name: t("inventory.chargeHistory.show") }))
 expect(screen.getByRole("alert").textContent).toBe(t("inventory.chargeHistory.loadError"))
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
