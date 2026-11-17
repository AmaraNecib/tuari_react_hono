import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { ApplicationClient } from "@tuari/contracts"
import { i18n } from "@/i18n"
import { ExactProjectWarehousePages } from "./exact-project-warehouse-pages"
const { legacyInventoryReads } = vi.hoisted(() => ({ legacyInventoryReads: { inventoryLocationContentsGet: vi.fn(), inventoryTransferHistoryList: vi.fn(), inventoryAssetsTransfer: vi.fn(), inventoryConsumablesTransfer: vi.fn() } }))
vi.mock("@/lib/orpc-client", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/orpc-client")>(), rpcClient: legacyInventoryReads }))
vi.mock("./home-view-navigation", () => ({ useHomeViewNavigation: () => ({}) }))
vi.mock("@/router/navigation", async importOriginal => ({ ...await importOriginal<typeof import("@/router/navigation")>(), WorkspaceLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock("@tanstack/react-router", async importOriginal => ({ ...await importOriginal<typeof import("@tanstack/react-router")>(), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
afterEach(cleanup)
it("does not display the previous warehouse team when navigating to another warehouse", async () => {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 30_000 } } })
  const client = {
    warehousesList: vi.fn(async () => ({ items: ["a", "b"].map(id => ({ id, name: `Warehouse ${id}`, status: "ACTIVE", managerId: null, address: null, notes: null })) })),
    employeesList: vi.fn(async () => ({ items: ["a", "b"].map(id => ({ id, firstName: "Worker", lastName: id, status: "ACTIVE" })) })),
    warehouseAssignmentsList: vi.fn(async ({ warehouseId }: { warehouseId: string }) => ({ items: [{ id: warehouseId, employeeId: warehouseId, warehouseId, status: "ACTIVE", startDate: "2026-11-01", endDate: null, notes: null }] })),
    warehouseManagerOwnershipHistoryList: vi.fn(async () => ({ items: [] })),
  } as unknown as ApplicationClient
  const view = (warehouseId: string) => <QueryClientProvider client={query}><ExactProjectWarehousePages client={client} workspaceId="workspace" userId="user" page="warehouse-details" warehouseId={warehouseId} detailTab="team" onProjectTab={vi.fn()} onWarehouseTab={vi.fn()} /></QueryClientProvider>
  const mounted = render(view("a"))
  await screen.findByText("Worker a")
  mounted.rerender(view("b"))
  expect(screen.queryByText("Worker a")).toBeNull()
  await screen.findByText("Worker b")
  expect(client.warehouseAssignmentsList).toHaveBeenCalledWith({ warehouseId: "b" })
})

it.each([
  { type: "project", page: "project-details", tab: "items", id: "project-a", label: "North site", supportedTab: "workers" },
  { type: "warehouse", page: "warehouse-details", tab: "items", id: "warehouse-a", label: "Central depot", supportedTab: "team" },
] as const)("keeps original $type tabs while refusing legacy inventory reads", async ({ type, page, tab, id, label, supportedTab }) => {
  legacyInventoryReads.inventoryLocationContentsGet.mockClear()
  legacyInventoryReads.inventoryTransferHistoryList.mockClear()
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } })
  const client = {
    projectsList: vi.fn(async () => ({ items: [{ id: "project-a", name: "North site", status: "ACTIVE", managerId: null, location: null, notes: null }] })),
    warehousesList: vi.fn(async () => ({ items: [{ id: "warehouse-a", name: "Central depot", status: "ACTIVE", managerId: null, address: null, notes: null }] })),
    employeesList: vi.fn(async () => ({ items: [] })),
    rolesList: vi.fn(async () => ({ items: [] })),
    projectAssignmentsList: vi.fn(async () => ({ items: [] })),
    warehouseAssignmentsList: vi.fn(async () => ({ items: [] })),
    projectManagerOwnershipHistoryList: vi.fn(async () => ({ items: [] })),
    warehouseManagerOwnershipHistoryList: vi.fn(async () => ({ items: [] })),
  } as unknown as ApplicationClient
  const component = <QueryClientProvider client={query}><ExactProjectWarehousePages client={client} workspaceId="workspace" userId="user" page={page} projectId={type === "project" ? id : undefined} warehouseId={type === "warehouse" ? id : undefined} detailTab={tab} onProjectTab={vi.fn()} onWarehouseTab={vi.fn()} /></QueryClientProvider>
  render(component)
  await screen.findByRole("heading", { name: label })
  expect(screen.getByRole("tab", { name: supportedTab === "workers" ? i18n.t("detailPages.project.workersTab") : i18n.t("detailPages.warehouse.teamTab") })).toBeTruthy()
  expect(await screen.findByText(i18n.t("application.unavailable"))).toBeTruthy()
  fireEvent.click(screen.getByRole("tab", { name: "سجل التحويلات" }))
  expect(await screen.findByText(i18n.t("application.unavailable"))).toBeTruthy()
  expect(legacyInventoryReads.inventoryLocationContentsGet).not.toHaveBeenCalled()
  expect(legacyInventoryReads.inventoryTransferHistoryList).not.toHaveBeenCalled()
  expect(legacyInventoryReads.inventoryAssetsTransfer).not.toHaveBeenCalled()
  expect(legacyInventoryReads.inventoryConsumablesTransfer).not.toHaveBeenCalled()
})
