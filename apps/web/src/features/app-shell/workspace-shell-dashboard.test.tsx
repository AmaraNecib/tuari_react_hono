import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { ApplicationCapabilities, ApplicationClient } from "@tuari/contracts"
import { i18n } from "@/i18n"
import { buildHomeViewCopy } from "./home-view-copy"
import { WorkspaceShell } from "./workspace-shell"

const hooks = vi.hoisted(() => ({ debts: vi.fn(), invoices: vi.fn(), items: vi.fn() }))
const unavailable = { data: undefined, isPending: true, isError: false }
vi.mock("@/features/debts/debts-queries", () => ({ useDebtsSummaryQuery: (options: unknown) => { hooks.debts(options); return unavailable } }))
vi.mock("@/features/inventory/inventory-hooks", () => ({
  useInventoryInvoiceGroupsQuery: (options: unknown) => { hooks.invoices(options); return unavailable },
  useInventoryItemDefinitionsQuery: (options: unknown) => { hooks.items(options); return unavailable },
}))
afterEach(cleanup)
it("mounts the real production dashboard with supported counts and disabled financial query families", async () => {
  const client = {
    employeesList: vi.fn(async () => ({ items: [{ id: "worker", status: "ACTIVE", roleId: "worker-role" }] })),
    rolesList: vi.fn(async () => ({ items: [{ id: "worker-role", key: "worker" }] })),
    projectsList: vi.fn(async () => ({ items: [{ id: "project", status: "ACTIVE" }] })),
    warehousesList: vi.fn(async () => ({ items: [] })),
  } as unknown as ApplicationClient
  const capabilities = { workspaceId: "11111111-1111-4111-8111-111111111111" } as ApplicationCapabilities
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={query}><WorkspaceShell client={client} capabilities={capabilities} copy={buildHomeViewCopy(i18n.t)} page="dashboard" session={{ id: "operator", phone: "0555000001" } as never} theme="light" resetWorkspacePending={false} updateAccountPending={false} onResetWorkspace={vi.fn()} onSaveAccount={async () => undefined} onThemeToggle={vi.fn()} onUpdateApplied={vi.fn()} onPendingCommandChange={vi.fn()} /></QueryClientProvider>)
  await screen.findByRole("link", { name: /إضافة مشروع/ })
  expect(hooks.debts).toHaveBeenLastCalledWith({ enabled: false })
  expect(hooks.invoices).toHaveBeenLastCalledWith({ enabled: false })
  expect(hooks.items).toHaveBeenLastCalledWith({ enabled: false })
  expect(screen.getByText(i18n.t("metrics.workers"))).toBeTruthy()
  expect(screen.getByRole("button", { name: /إضافة فاتورة/ }).hasAttribute("disabled")).toBe(true)
  expect(client.employeesList).toHaveBeenCalledOnce()
})
