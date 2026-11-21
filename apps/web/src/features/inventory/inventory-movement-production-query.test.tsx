import "@/i18n"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { exactInventoryLocationSchema, inventoryItemDefinitionSchema, type ExactInventoryClient } from "@tuari/contracts"
import { financialClient, rpcLink } from "@/lib/orpc-client"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { ExactInventoryPage } from "./inventory-exact-page"
import { ExactInventoryMovementForm } from "./inventory-exact-movement-form"
import { useExactInventoryDefinitions, useExactInventoryLocation } from "./inventory-exact-queries"

const date = "2026-11-10T00:00:00.000Z"
const definition = inventoryItemDefinitionSchema.parse({ id: "material", name: "Material", itemType: "CONSUMABLE", unit: "m", isActive: true, description: null, createdAt: date, updatedAt: date })
type Contents = Awaited<ReturnType<ExactInventoryClient["locationContents"]>>
const empty: Contents = { assets: [], consumables: [] }
const stock: Contents = { assets: [], consumables: ["first", "second"].map(id => ({ id, inventoryEntryId: `producer-${id}`, itemDefinitionId: "material", itemName: id, warehouseId: "same", projectId: null, quantity: 3, locationLabel: "Warehouse", createdAt: date, updatedAt: date })) }
const locations = [{ id: "same", type: "WAREHOUSE" as const, label: "Warehouse" }, { id: "same", type: "PROJECT" as const, label: "Project" }]
const parties = [{ id: "party", label: "Party" }]
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks() })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(definitions: () => Promise<unknown>, contents: (input: unknown) => Promise<unknown>) {
  exactInventoryLocationSchema.parse(stock)
  exactInventoryLocationSchema.parse(empty)
  const transport = vi.spyOn(rpcLink, "call").mockImplementation(async (path, input) => {
    switch (path.join(".")) {
      case "session": return { user: { id: "operator" } }
      case "financial.inventory.definitions": return definitions()
      case "financial.inventory.locationContents": return contents(input)
      case "financial.inventory.listInvoices":
      case "financial.inventory.listOutbounds": return []
      default: throw new Error(`Unexpected call ${path.join(".")}`)
    }
  })
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  clients.push(query)
  query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={query}>{children}</QueryClientProvider>
  return { query, wrapper, transport }
}
const pick = () => screen.getByRole("combobox", { name: "المخزون المختار" }) as HTMLSelectElement
const confirm = () => screen.getByRole("button", { name: "تأكيد التحويل" }) as HTMLButtonElement
function LiveForm({ project = false, submit }: { project?: boolean; submit: Parameters<typeof ExactInventoryMovementForm>[0]["submit"] }) {
  const client = financialClient.inventory
  const definitions = useExactInventoryDefinitions(client)
  const contents = useExactInventoryLocation(client, project ? { projectId: "same" } : { warehouseId: "same" })
  return <ExactInventoryMovementForm client={client} contents={contents.data ?? empty} definitions={definitions.data ?? []} locations={locations} parties={parties} source={project ? "PROJECT:same" : "WAREHOUSE:same"} pending={false} error={null} close={() => {}} submit={submit} />
}
it.each([true, false])("reconciles real query arrivals, definitions first=%s, without losing explicit selection", async definitionsFirst => {
  const defs = deferred<typeof definition[]>()
  const rows = deferred<Contents>()
  const { wrapper, query, transport } = setup(() => defs.promise, async input => {
    const value = await rows.promise
    return input && typeof input === "object" && "projectId" in input
      ? { ...value, consumables: value.consumables.map(row => ({ ...row, warehouseId: null, projectId: "same" })) }
      : value
  })
  const submit = vi.fn().mockResolvedValue(undefined)
  const view = render(<LiveForm submit={submit} />, { wrapper })
  fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "GIFT" } })
  expect(confirm().disabled).toBe(true)
  await act(async () => { if (definitionsFirst) defs.resolve([definition]); else rows.resolve(stock) })
  expect(confirm().disabled).toBe(true)
  await act(async () => { if (definitionsFirst) rows.resolve(stock); else defs.resolve([definition]) })
  await waitFor(() => expect(pick().value).toBe("first"))
  expect(confirm().disabled).toBe(false)
  fireEvent.change(pick(), { target: { value: "second" } })
  await act(async () => { query.setQueriesData({ predicate: q => q.queryKey.includes("location") }, { ...stock, consumables: stock.consumables.map(row => ({ ...row, quantity: 2 })) }) })
  expect(pick().value).toBe("second")
  fireEvent.click(confirm())
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0]![0]).toEqual({ kind: "createOutbound", input: { requestId: "pending", fromType: "WAREHOUSE", fromId: "same", transferType: "GIFT", counterpartyId: "party", notes: null, debtAmountDzd: undefined, firstPaymentAmountDzd: undefined, items: [{ itemId: "material", optionId: "second", quantity: 1, unitPriceDzd: undefined, derivedPrice: undefined }] } })
  fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "TRANSFER" } })
  fireEvent.change(screen.getByRole("combobox", { name: "الوجهة" }), { target: { value: "PROJECT:same" } })
  fireEvent.click(confirm())
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
  expect(submit.mock.calls[1]![0]).toEqual({ kind: "transferConsumable", input: { requestId: "pending", inventoryEntryId: "producer-second", quantity: 1, fromWarehouseId: "same", fromProjectId: undefined, toWarehouseId: undefined, toProjectId: "same", note: null } })
  await act(async () => { query.setQueriesData({ predicate: q => q.queryKey.includes("location") }, { ...stock, consumables: [stock.consumables[0]!] }) })
  await waitFor(() => expect(pick().value).toBe("first"))
  await act(async () => { query.setQueriesData({ predicate: q => q.queryKey.includes("location") }, empty) })
  await waitFor(() => expect(pick().value).toBe(""))
  expect(confirm().disabled).toBe(true)
  view.rerender(<LiveForm project submit={submit} />)
  await waitFor(() => expect(transport.mock.calls.some(([path, input]) => path.join(".") === "financial.inventory.locationContents" && JSON.stringify(input) === '{"projectId":"same"}')).toBe(true))
  await waitFor(() => expect(pick().value).toBe("first"))
  fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "GIFT" } })
  fireEvent.click(confirm())
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(3))
  expect(submit.mock.calls[2]![0].input).toMatchObject({ fromType: "PROJECT", fromId: "same", items: [{ optionId: "first", itemId: "material" }] })
  expect(transport.mock.calls.filter(([path]) => path.join(".") === "financial.inventory.definitions")).toHaveLength(1)
  expect(transport.mock.calls.filter(([path]) => path.join(".") === "financial.inventory.locationContents")).toHaveLength(2)
})
it.each([true, false])("initial movement opens only after both successful arrivals, definitions first=%s", async definitionsFirst => {
  const defs = deferred<typeof definition[]>()
  const rows = deferred<Contents>()
  const { wrapper } = setup(() => defs.promise, () => rows.promise)
  render(<ExactInventoryPage client={financialClient.inventory} locations={[locations[0]!]} parties={parties} initialMovement />, { wrapper })
  expect(screen.queryByRole("dialog")).toBeNull()
  await act(async () => { if (definitionsFirst) defs.resolve([definition]); else rows.resolve(stock) })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.queryByText("لا توجد عناصر متاحة في المصدر.")).toBeNull()
  await act(async () => { if (definitionsFirst) rows.resolve(stock); else defs.resolve([definition]) })
  await screen.findByRole("dialog")
  expect(pick().value).toBe("first")
  fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "GIFT" } })
  expect(confirm().disabled).toBe(false)
})
it.each([true, false])("initial movement waits truthfully for dependencies and retries, definition failure=%s", async definitionFailure => {
  const request = deferred<unknown>()
  const definitions = vi.fn().mockImplementationOnce(() => definitionFailure ? request.promise : Promise.resolve([definition])).mockResolvedValue([definition])
  const contents = vi.fn().mockImplementationOnce(() => definitionFailure ? Promise.resolve(stock) : request.promise).mockResolvedValue(empty)
  const { wrapper } = setup(definitions, contents)
  render(<ExactInventoryPage client={financialClient.inventory} locations={[locations[0]!]} parties={parties} initialMovement />, { wrapper })
  await waitFor(() => expect(definitions).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(contents).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.queryByText("لا توجد عناصر متاحة في المصدر.")).toBeNull()
  await act(async () => request.reject(new Error("offline")))
  expect(await screen.findByRole("alert")).toBeTruthy()
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
  await screen.findByRole("dialog")
  await waitFor(() => expect(pick().value).toBe(definitionFailure ? "first" : ""))
  if (!definitionFailure) expect(confirm().disabled).toBe(true)
})
