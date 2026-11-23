// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuditLogPage } from "./audit-log-page"
import { useSystemLogQuery } from "../app-shell/workspace-queries"
import { workspaceQueryKeys } from "../app-shell/workspace-keys"

const mocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/lib/orpc-client", () => ({
  rpcClient: { systemLogList: mocks.list },
  orpc: { session: { queryOptions: () => ({ queryKey: ["session"] }) } },
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui/date-picker", () => ({ DatePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input value={value} onChange={(event) => onChange(event.target.value)} /> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const entry = { id: "e1", createdAt: "2026-01-15T10:00:00Z", actorLabel: "Actor", entityType: "INVENTORY_ITEM", actionType: "INVENTORY_ITEM_CREATED", entityId: "item1", summary: "Inventory created" }
function Observer() { useSystemLogQuery({ filters: {} }); return null }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  render(<QueryClientProvider client={client}><Observer /><AuditLogPage /></QueryClientProvider>)
  return client
}
it("shares the system-log cache and refreshes after domain invalidation", async () => {
  mocks.list.mockResolvedValue({ items: [entry] })
  const client = mount()
  await screen.findByText("Inventory created")
  expect(mocks.list).toHaveBeenCalledTimes(1)
  expect(client.getQueryCache().findAll({ queryKey: workspaceQueryKeys.systemLog("u1") })).toHaveLength(1)
  mocks.list.mockResolvedValue({ items: [{ ...entry, summary: "Refreshed" }] })
  await client.invalidateQueries({ queryKey: workspaceQueryKeys.systemLog("u1") })
  await screen.findByText("Refreshed")
})
it("uses contract enum filters and delegates inclusive dates to the shared query", async () => {
  mocks.list.mockResolvedValue({ items: [entry] })
  mount()
  await screen.findByText("Inventory created")
  fireEvent.change(screen.getByLabelText("auditLog.domain"), { target: { value: "INVENTORY_ITEM" } })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: "INVENTORY_ITEM" })))
  fireEvent.change(screen.getByLabelText("auditLog.action"), { target: { value: "INVENTORY_ITEM_CREATED" } })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ actionType: "INVENTORY_ITEM_CREATED" })))
  fireEvent.change(screen.getByLabelText("common.dateTo"), { target: { value: "15/01/2026" } })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ toDate: "2026-01-15T22:59:59.999Z" })))
  fireEvent.change(screen.getByLabelText("auditLog.search"), { target: { value: "missing" } })
  await screen.findByText("auditLog.noResults")
})
it("shows RPC failures", async () => {
  mocks.list.mockRejectedValue(new Error("Unavailable"))
  mount()
  await screen.findByText(/Unavailable/)
})
