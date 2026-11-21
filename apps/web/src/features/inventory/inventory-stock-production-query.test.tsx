import "@/i18n"
import i18n from "i18next"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { rpcLink } from "@/lib/orpc-client"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { WarehouseDetailsPage } from "@/features/warehouses/warehouse-details-page"
import { ProjectDetailsPage } from "@/features/projects/project-details-page"

vi.mock("@tanstack/react-router", async original => ({ ...await original<typeof import("@tanstack/react-router")>(), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })
const t = (key: string) => i18n.t(key)
const record = { id: "same", name: "Location", managerId: null, managerName: "Manager", status: "ACTIVE", notes: null }
function page(project: boolean) {
  return project
    ? <ProjectDetailsPage project={{ ...record, location: null, activeWorkers: 0 }} activeTab="items" onTabChange={() => {}} managementHistoryRows={[]} workerRows={[]} />
    : <WarehouseDetailsPage warehouse={{ ...record, address: null }} activeTab="items" onTabChange={() => {}} managementHistoryRows={[]} teamRows={[]} />
}
const user = { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" }
function setup({ cachedSession = true, session = async () => ({ user }), location = async () => ({ assets: [], consumables: [] }) }: {
  cachedSession?: boolean
  session?: () => Promise<{ user: typeof user }>
  location?: (input: unknown) => Promise<unknown>
} = {}) {
  // Retain the real ORPC proxy, session hook, workspace gate and QueryClient.
  // Only the transport returns fixtures. A stable fake client hid this loop.
  const transport = vi.spyOn(rpcLink, "call").mockImplementation(async (path, input) => {
    switch (path.join(".")) {
      case "session": return session()
      case "financial.inventory.locationContents": return location(input)
      case "financial.inventory.definitions": return []
      case "warehousesList": return { items: [{ id: "same", name: "Warehouse" }] }
      case "projectsList": return { items: [{ id: "same", name: "Project" }] }
      case "externalCounterpartiesList": return { items: [] }
      default: throw new Error(`Unexpected transport call ${path.join(".")}`)
    }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  clients.push(client)
  if (cachedSession) client.setQueryData(sessionQueryKey, { user })
  return { client, transport, wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}

it.each([false, true])("renders production stock queries after async arrival and cached rerender, project=%s", async project => {
  let arrive!: (value: { assets: never[]; consumables: never[] }) => void
  const location = vi.fn().mockImplementationOnce(() => new Promise(resolve => { arrive = resolve }))
    .mockResolvedValue({ assets: [], consumables: [] })
  const { client, wrapper } = setup({ location })
  const view = render(page(project), { wrapper })
  await waitFor(() => expect(location).toHaveBeenCalledTimes(1))
  expect(screen.getByRole("status").textContent).toBe(t("exactCommerce.loadingStock"))
  await act(async () => arrive({ assets: [], consumables: [] }))
  expect(await screen.findByText(t("exactCommerce.noStock"))).toBeTruthy()
  view.rerender(page(project))
  expect(screen.getByText(t("exactCommerce.noStock"))).toBeTruthy()
  expect(location.mock.calls).toEqual([[project ? { projectId: "same" } : { warehouseId: "same" }]])
  const count = client.getQueryCache().getAll().length
  // Same textual ID in another location type must select another stock query.
  view.rerender(page(!project))
  await waitFor(() => expect(location).toHaveBeenCalledTimes(2))
  expect(await screen.findByText(t("exactCommerce.noStock"))).toBeTruthy()
  expect(location.mock.calls[1]).toEqual([project ? { warehouseId: "same" } : { projectId: "same" }])
  expect(client.getQueryCache().getAll()).toHaveLength(count + 1)
})

it("waits for the real session query before fetching stock", async () => {
  let arrive!: (value: { user: typeof user }) => void
  const location = vi.fn().mockResolvedValue({ assets: [], consumables: [] })
  const { wrapper } = setup({ cachedSession: false, session: () => new Promise(resolve => { arrive = resolve }), location })
  render(page(false), { wrapper })
  expect(location).not.toHaveBeenCalled()
  await act(async () => arrive({ user }))
  expect(await screen.findByText(t("exactCommerce.noStock"))).toBeTruthy()
  expect(location.mock.calls).toEqual([[{ warehouseId: "same" }]])
})

it("keeps transport error and retry distinct from empty stock", async () => {
  const location = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ assets: [], consumables: [] })
  const { wrapper } = setup({ location })
  render(page(false), { wrapper })
  expect((await screen.findByRole("alert")).textContent).toContain(t("exactCommerce.loadStockError"))
  expect(screen.queryByText(t("exactCommerce.noStock"))).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: t("common.retry") }))
  expect(await screen.findByText(t("exactCommerce.noStock"))).toBeTruthy()
  expect(location).toHaveBeenCalledTimes(2)
})
