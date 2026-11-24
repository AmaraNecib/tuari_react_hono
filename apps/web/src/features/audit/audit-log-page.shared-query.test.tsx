// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuditLogPage } from "./audit-log-page"
import { useSystemLogQuery } from "../app-shell/workspace-queries"
import { workspaceQueryKeys, sessionQueryKey } from "../app-shell/workspace-keys"
import { useUpdateAccountSettingsMutation } from "../app-shell/workspace-mutations"

const mocks = vi.hoisted(() => ({ list: vi.fn(), session: vi.fn(), updateProfile: vi.fn() }))
beforeEach(() => { mocks.session.mockReturnValue({ data: { user: { id: "u1" } } }) })
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: mocks.session }))
vi.mock("@/lib/orpc-client", () => ({
  rpcClient: { systemLogList: mocks.list },
  orpc: { session: { queryOptions: () => ({ queryKey: ["session"] }) } },
}))
vi.mock("react-i18next", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-i18next")>(),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("@/lib/auth-api", () => ({ updateCurrentProfile: mocks.updateProfile }))
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }))
vi.mock("@/components/ui/date-picker", () => ({ DatePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input value={value} onChange={(event) => onChange(event.target.value)} /> }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
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
  fireEvent.change(screen.getByLabelText("common.dateTo"), { target: { value: "2026-01-15" } })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ toDate: "2026-01-15T22:59:59.999Z" })))
  fireEvent.change(screen.getByLabelText("auditLog.search"), { target: { value: "missing" } })
  await screen.findByText("auditLog.noResults")
})
it("exports translated labels for the searched rows", async () => {
  mocks.list.mockResolvedValue({ items: [entry, { ...entry, id: "e2", summary: "Other entry" }] })
  let csv = ""
  vi.stubGlobal("Blob", class { constructor(parts: string[]) { csv = parts.join("") } })
  vi.stubGlobal("URL", { createObjectURL: () => "blob:export" })
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  mount()
  await screen.findByText("Inventory created")
  fireEvent.change(screen.getByLabelText("auditLog.search"), { target: { value: "Inventory" } })
  fireEvent.click(screen.getByRole("button", { name: "auditLog.exportCsv" }))
  expect(csv).toContain("systemLog.entityInventoryItem")
  expect(csv).toContain("systemLog.inventoryItemCreated")
  expect(csv).toContain("Inventory created")
  expect(csv).not.toContain("Other entry")
})
it.each([undefined, null])("does not fetch without a resolved user session: %s", async (data) => {
  mocks.session.mockReturnValue({ data })
  mount()
  await screen.findByText("tableQuery.loading")
  expect(mocks.list).not.toHaveBeenCalled()
})
it("keeps user caches separate when the session changes", async () => {
  mocks.list.mockResolvedValueOnce({ items: [entry] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const view = () => <QueryClientProvider client={client}><AuditLogPage /></QueryClientProvider>
  const { rerender } = render(view())
  await screen.findByText("Inventory created")
  let finish!: (value: { items: typeof entry[] }) => void
  mocks.list.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  mocks.session.mockReturnValue({ data: { user: { id: "u2" } } })
  rerender(view())
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
  expect(screen.queryByText("Inventory created")).toBeNull()
  finish({ items: [{ ...entry, summary: "User two entry" }] })
  await screen.findByText("User two entry")
  expect(client.getQueryData([...workspaceQueryKeys.systemLog("u1"), {}])).toEqual({ items: [entry] })
  expect(client.getQueryData([...workspaceQueryKeys.systemLog("u2"), {}])).toEqual({ items: [{ ...entry, summary: "User two entry" }] })
})
it("clears domain and action filters when All is selected", async () => {
  mocks.list.mockResolvedValue({ items: [entry] })
  const client = mount()
  await screen.findByText("Inventory created")
  fireEvent.change(screen.getByLabelText("auditLog.domain"), { target: { value: "EMPLOYEE" } })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: "EMPLOYEE" })))
  fireEvent.change(screen.getByLabelText("auditLog.action"), { target: { value: "EMPLOYEE_CREATED" } })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ actionType: "EMPLOYEE_CREATED" })))
  fireEvent.change(screen.getByLabelText("auditLog.domain"), { target: { value: "ALL" } })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: undefined, actionType: "EMPLOYEE_CREATED" })))
  fireEvent.change(screen.getByLabelText("auditLog.action"), { target: { value: "ALL" } })
  // All reuses the original fresh cache. Invalidate it to inspect the next request.
  await client.invalidateQueries({ queryKey: workspaceQueryKeys.systemLog("u1") })
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ entityType: undefined, actionType: undefined })))
  expect((screen.getByLabelText("auditLog.domain") as HTMLSelectElement).value).toBe("ALL")
  expect((screen.getByLabelText("auditLog.action") as HTMLSelectElement).value).toBe("ALL")
})
it("refreshes audit entries after the account update mutation succeeds", async () => {
  mocks.list.mockResolvedValue({ items: [entry] })
  mocks.updateProfile.mockImplementation(async () => {
    mocks.list.mockResolvedValue({ items: [{ ...entry, summary: "Account updated" }] })
  })
  function UpdateAccount() {
    const mutation = useUpdateAccountSettingsMutation()
    return <button onClick={() => mutation.mutate({ name: "Updated name" })}>Update account</button>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(sessionQueryKey, { user: { id: "u1", name: "User one", phone: "0550000000", version: "1" } })
  render(<QueryClientProvider client={client}><UpdateAccount /><AuditLogPage /></QueryClientProvider>)
  await screen.findByText("Inventory created")
  fireEvent.click(screen.getByRole("button", { name: "Update account" }))
  await screen.findByText("Account updated")
  expect(mocks.updateProfile).toHaveBeenCalledWith({ name: "Updated name", phone: undefined, currentPassword: undefined })
  expect(mocks.list).toHaveBeenCalledTimes(2)
})
it("shows RPC failures", async () => {
  mocks.list.mockRejectedValue(new Error("Unavailable"))
  mount()
  await screen.findByText(/TUARI-[0-9A-F]{8}/)
  expect(screen.queryByText(/Unavailable/)).toBeNull()
})
