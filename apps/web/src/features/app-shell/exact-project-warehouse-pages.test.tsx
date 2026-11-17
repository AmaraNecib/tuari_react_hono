import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { ApplicationClient } from "@tuari/contracts"
import { i18n } from "@/i18n"
import { ExactProjectWarehousePages } from "./exact-project-warehouse-pages"
const { legacyInventoryReads } = vi.hoisted(() => {
  const rejectLegacyCall = (name: string) => vi.fn(() => { throw new Error(`Unexpected legacy RPC call: ${name}`) })
  return { legacyInventoryReads: {
    inventoryLocationContentsGet: rejectLegacyCall("inventoryLocationContentsGet"),
    inventoryTransferHistoryList: rejectLegacyCall("inventoryTransferHistoryList"),
    inventoryAssetsTransfer: rejectLegacyCall("inventoryAssetsTransfer"),
    inventoryConsumablesTransfer: rejectLegacyCall("inventoryConsumablesTransfer"),
  } }
})
vi.mock("@/lib/orpc-client", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/orpc-client")>()
  return {
    ...actual,
    rpcClient: new Proxy(legacyInventoryReads, {
      get(target, property, receiver) {
        if (typeof property === "symbol" || Reflect.has(target, property)) return Reflect.get(target, property, receiver)
        throw new Error(`Unexpected rpcClient.${String(property)} access`)
      },
    }),
  }
})
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
  { type: "project", page: "projects", recordId: "project-a", recordName: "North site", titleKey: "sections.projects.label" },
  { type: "warehouse", page: "warehouses", recordId: "warehouse-a", recordName: "Central depot", titleKey: "sections.warehouses.label" },
] as const)("requires confirmation before archiving a $type", async ({ type, page, recordId, recordName, titleKey }) => {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } })
  const projectsUpdate = vi.fn(async () => ({ success: true }))
  const warehousesUpdate = vi.fn(async () => ({ success: true }))
  const update = type === "project" ? projectsUpdate : warehousesUpdate
  const client = {
    projectsList: vi.fn(async () => ({ items: [{ id: "project-a", name: "North site", managerId: null, location: null, notes: null, status: "ACTIVE" }] })),
    warehousesList: vi.fn(async () => ({ items: [{ id: "warehouse-a", name: "Central depot", managerId: null, address: null, notes: null, status: "ACTIVE" }] })),
    employeesList: vi.fn(async () => ({ items: [] })),
    projectAssignmentsList: vi.fn(async () => ({ items: [] })),
    projectsUpdate,
    warehousesUpdate,
  } as unknown as ApplicationClient
  render(<QueryClientProvider client={query}><ExactProjectWarehousePages client={client} workspaceId="workspace" userId="user" page={page} onProjectTab={vi.fn()} onWarehouseTab={vi.fn()} /></QueryClientProvider>)

  await screen.findByRole("heading", { name: i18n.t(titleKey) })
  await screen.findByText(recordName)
  fireEvent.click(screen.getByRole("button", { name: i18n.t("common.archive") }))
  expect(update).not.toHaveBeenCalled()

  const firstDialog = screen.getByRole("alertdialog")
  expect(firstDialog.textContent).toContain(recordName)
  fireEvent.click(within(firstDialog).getByRole("button", { name: i18n.t("common.cancel") }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  expect(update).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole("button", { name: i18n.t("common.archive") }))
  const confirmation = screen.getByRole("alertdialog")
  fireEvent.click(within(confirmation).getByRole("button", { name: i18n.t("common.confirm") }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(update).toHaveBeenCalledWith({ id: recordId, status: "ARCHIVED" })
  expect(type === "project" ? warehousesUpdate : projectsUpdate).not.toHaveBeenCalled()
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
