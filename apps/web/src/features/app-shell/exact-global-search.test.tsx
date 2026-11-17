import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { i18n } from "@/i18n"
import { buildHomeViewCopy } from "./home-view-copy"
import { HomeViewSignedInShell } from "./home-view-signed-in-shell"

// Debounce and modal interaction are covered by the real global-search E2E; this test pins corpus isolation.
vi.mock("@/hooks/use-debounced-value", () => ({ useDebouncedValue: (value: string) => value }))
const mocks = vi.hoisted(() => ({ legacy: vi.fn(), inventory: vi.fn() }))
vi.mock("./workspace-queries", () => {
  const query = (options: { enabled?: boolean }) => { mocks.legacy(options); return { data: { items: [] } } }
  return { useEmployeesQuery: query, useProjectsQuery: query, useWarehousesQuery: query,
    useExternalCounterpartiesQuery: (options: { enabled?: boolean }) => {
      mocks.legacy(options)
      return { data: { items: [{ id: "old-external", fullName: "Forbidden old external", phoneNumber: "0555000009" }] } }
    },
    useDebtAccountsQuery: (options: { enabled?: boolean }) => {
      mocks.legacy(options)
      return { data: { items: [{ id: "old-debt", partyType: "EXTERNAL", externalCounterpartyId: "old-external", direction: "RECEIVABLE", currentBalance: 92500, status: "OPEN" }] } }
    } }
})
vi.mock("@/features/inventory/inventory-hooks", () => ({ useInventoryItemDefinitionsQuery: (options: unknown) => { mocks.inventory(options); return { data: { items: [{ id: "old-item", name: "Forbidden old item" }] } } }, useInventoryInvoiceGroupsQuery: (options: unknown) => { mocks.inventory(options); return { data: { items: [{ id: "old-invoice", invoiceNumber: "Forbidden old invoice", supplierName: "Old supplier" }] } } } }))
vi.mock("@/router/navigation", async () => ({ ...await vi.importActual<typeof import("@/router/navigation")>("@/router/navigation"), WorkspaceLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))
vi.mock("@/components/ui/search-dialog", () => ({ SearchDialog: ({ isOpen, onQueryChange, results }: { isOpen: boolean; onQueryChange: (query: string) => void; results: Array<{ id: string; title: string; description?: string }> }) => isOpen ? <div role="dialog">{["Current exact warehouse", "Forbidden old", "Other workspace warehouse"].map(value => <button key={value} onClick={() => onQueryChange(value)}>{`Search ${value}`}</button>)}{results.map(item => <p key={item.id} data-testid={item.id}>{item.title}{item.description ? <span>{item.description}</span> : null}</p>)}</div> : null }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function warehouse(id: string, name: string) { return { id, name, address: null, managerId: null, status: "ACTIVE" as const, notes: null, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" } }

it("never includes cached legacy financial or inventory data in the exact corpus", async () => {
  window.localStorage.setItem("journey-home-tour-status", "skipped")
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const client = { employeesList: vi.fn(async () => ({ items: [] })), projectsList: vi.fn(async () => ({ items: [] })), warehousesList: vi.fn(async () => ({ items: [warehouse("w", "Current exact warehouse")] })) }
  const props = { breadcrumbItems: [], copy: buildHomeViewCopy(i18n.t), deletePending: false, page: "dashboard" as const, pendingDelete: null, session: { id: "u", name: "Owner", phone: "0555000001", version: "1" }, sidebarCollapsed: false, signOutPending: false, signOutOpen: false, theme: "light" as const, showRestartModal: false, onConfirmDelete: vi.fn(), onConfirmSignOut: vi.fn(), onPendingDeleteChange: vi.fn(), onRestartLater: vi.fn(), onRestartNow: vi.fn(), onSetSidebarCollapsed: vi.fn(), onSignOutOpenChange: vi.fn(), onThemeToggle: vi.fn(), exactMode: true, exactSearch: { workspaceId: "workspace-a", userId: "u", client } }
  const view = render(<QueryClientProvider client={query}><HomeViewSignedInShell {...props}><div /></HomeViewSignedInShell></QueryClientProvider>)
  expect(client.warehousesList).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: i18n.t("shortcuts.search") }))
  await waitFor(() => expect(client.warehousesList).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "Search Current exact warehouse" }))
  await within(screen.getByRole("dialog")).findByText("Current exact warehouse")
  fireEvent.click(screen.getByRole("button", { name: "Search Forbidden old" }))
  await waitFor(() => expect(within(screen.getByRole("dialog")).queryByText("Current exact warehouse")).toBeNull())
  expect(within(screen.getByRole("dialog")).queryByTestId("debt-old-debt")).toBeNull()
  expect(within(screen.getByRole("dialog")).queryByText("Forbidden old item")).toBeNull()
  expect(within(screen.getByRole("dialog")).queryByText("Forbidden old external")).toBeNull()
  expect(within(screen.getByRole("dialog")).queryByText("Forbidden old invoice")).toBeNull()
  expect(mocks.legacy.mock.calls.every(([options]) => options.enabled === false)).toBe(true)
  expect(mocks.inventory.mock.calls.every(([options]) => options.enabled === false)).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Search Current exact warehouse" }))
  await within(screen.getByRole("dialog")).findByText("Current exact warehouse")
  const next = { employeesList: vi.fn(async () => ({ items: [] })), projectsList: vi.fn(async () => ({ items: [] })), warehousesList: vi.fn(async () => ({ items: [warehouse("other", "Other workspace warehouse")] })) }
  view.rerender(<QueryClientProvider client={query}><HomeViewSignedInShell {...props} exactSearch={{ workspaceId: "workspace-b", userId: "u", client: next }}><div /></HomeViewSignedInShell></QueryClientProvider>)
  await waitFor(() => expect(next.warehousesList).toHaveBeenCalledOnce())
  expect(within(screen.getByRole("dialog")).queryByText("Current exact warehouse")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Search Other workspace warehouse" }))
  await within(screen.getByRole("dialog")).findByText("Other workspace warehouse")
  view.rerender(<QueryClientProvider client={query}><HomeViewSignedInShell {...props} exactSearch={{ workspaceId: "workspace-b", userId: "different-user", client }}><div /></HomeViewSignedInShell></QueryClientProvider>)
  await waitFor(() => expect(client.warehousesList).toHaveBeenCalledTimes(2))
  expect(within(screen.getByRole("dialog")).queryByText("Other workspace warehouse")).toBeNull()
  expect(query.getQueryData(["application", "workspace-b", "different-user", "warehouses"])).toEqual({ items: [warehouse("w", "Current exact warehouse")] })
  view.unmount()
  query.clear()
})
