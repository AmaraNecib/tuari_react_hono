import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { ApplicationClient } from "@tuari/contracts"
import { ExactProjectWarehousePages } from "./exact-project-warehouse-pages"
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
