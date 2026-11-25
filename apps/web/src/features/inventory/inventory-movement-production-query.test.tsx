import "@/i18n"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { exactInventoryLocationSchema, inventoryItemDefinitionSchema, type ExactInventoryClient } from "@tuari/contracts"
import { financialClient, rpcLink } from "@/lib/orpc-client"
import { exactCommercePrefix } from "@/features/shared/exact-commerce-queries"
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
function setup(definitions: () => Promise<unknown>, contents: (input: unknown) => Promise<unknown>, chargeDefault: (input: unknown) => Promise<unknown> = async () => { throw new Error("Unexpected charge default") }) {
  exactInventoryLocationSchema.parse(stock)
  exactInventoryLocationSchema.parse(empty)
  const transport = vi.spyOn(rpcLink, "call").mockImplementation(async (path, input) => {
    switch (path.join(".")) {
      case "session": return { user: { id: "operator" } }
      case "financial.inventory.definitions": return definitions()
      case "financial.inventory.locationContents": return contents(input)
      case "financial.inventory.chargeDefault": return chargeDefault(input)
      case "financial.inventory.projectCharges": return { charges: [] }
      case "financial.inventory.projectContribution": return { equipmentChargesDzd: "0.00", chargedMaterialsDzd: "0.00", totalDzd: "0.00", parkedAssetValueDzd: "0.00" }
      case "financial.inventory.createOutbound":
      case "financial.inventory.transferConsumable": return {}
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
it.each((["stock removal", "inactive definition", "exhaustion", "manual choice"] as const).flatMap(reason => [
  { reason, entered: "٠", wire: "0.00" }, { reason, entered: "23.47", wire: "23.47" },
]))("clears $entered asset overrides after $reason but preserves a same-asset refresh", async ({ reason, entered, wire }) => {
  const assets = exactInventoryLocationSchema.parse({ assets: ["a", "b"].map(id => ({ id, inventoryEntryId: `producer-${id}`, itemDefinitionId: `pump-${id}`, assetName: `Pump ${id}`, assetTag: null, serialNumber: null, condition: null, purchaseDate: null, currentWarehouseId: "same", currentProjectId: null, currentLocationLabel: "Warehouse", note: null, purchasePriceDzd: "71.29", createdAt: date, updatedAt: date })), consumables: stock.consumables })
  const definitions = ["a", "b"].map(id => inventoryItemDefinitionSchema.parse({ ...definition, id: `pump-${id}`, name: `Pump ${id}`, itemType: "ASSET", unit: null }))
  const nextDefault = deferred<unknown>()
  const chargeDefault = vi.fn().mockImplementation(async input => {
    if (input.assetUnitId === "a") return { assetUnitId: "a", amountDzd: "71.29", purchasePriceDzd: "71.29", source: "PURCHASE_PRICE" }
    return nextDefault.promise
  })
  const { wrapper, query } = setup(async () => definitions, async () => assets, chargeDefault)
  const submit = vi.fn().mockResolvedValue(undefined)
  render(<LiveForm submit={submit} />, { wrapper })
  await waitFor(() => expect(pick().value).toBe("a"))
  fireEvent.change(screen.getByRole("combobox", { name: "الوجهة" }), { target: { value: "PROJECT:same" } })
  await screen.findByText("71.29")
  const override = () => screen.getByRole("checkbox", { name: "تحديد احتساب مختلف على المشروع" }) as HTMLInputElement
  fireEvent.click(override())
  fireEvent.change(screen.getByRole("textbox", { name: "احتساب المشروع، صفر يعني مجانًا" }), { target: { value: entered } })
  await act(async () => { query.setQueriesData({ predicate: q => q.queryKey.includes("location") }, { ...assets, consumables: assets.consumables.map(row => ({ ...row, quantity: 2 })) }) })
  expect(pick().value).toBe("a")
  expect(override().checked).toBe(true)
  expect(confirm().disabled).toBe(false)
  fireEvent.click(confirm())
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
  expect(submit.mock.calls[0]![0]).toEqual({ kind: "transferAsset", input: { requestId: "pending", assetUnitId: "a", toWarehouseId: undefined, toProjectId: "same", chargeAmountDzd: wire, note: null } })
  if (reason === "manual choice") fireEvent.change(pick(), { target: { value: "b" } })
  else if (reason === "inactive definition") {
    await act(async () => { query.setQueriesData({ predicate: q => q.queryKey.includes("definitions") }, [{ ...definitions[0]!, isActive: false }, definitions[1]!]) })
  } else {
    if (reason === "exhaustion") {
      await act(async () => { query.setQueriesData({ predicate: q => q.queryKey.includes("location") }, empty) })
      await waitFor(() => expect(pick().value).toBe(""))
      expect(confirm().disabled).toBe(true)
    }
    await act(async () => { query.setQueriesData({ predicate: q => q.queryKey.includes("location") }, { assets: [assets.assets[1]!], consumables: [] }) })
  }
  await waitFor(() => expect(pick().value).toBe("b"))
  expect(override().checked).toBe(false)
  expect(screen.queryByRole("textbox", { name: "احتساب المشروع، صفر يعني مجانًا" })).toBeNull()
  expect(confirm().disabled).toBe(true)
  fireEvent.click(confirm())
  expect(submit).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(chargeDefault).toHaveBeenCalledWith({ assetUnitId: "b" }))
  if (reason === "stock removal") {
    await act(async () => nextDefault.reject(new Error("default offline")))
    await screen.findByRole("alert")
    expect(confirm().disabled).toBe(true)
    expect(override().checked).toBe(false)
    chargeDefault.mockResolvedValueOnce({ assetUnitId: "b", amountDzd: "99.00", purchasePriceDzd: "99.00", source: "PURCHASE_PRICE" })
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
  } else await act(async () => nextDefault.resolve({ assetUnitId: "b", amountDzd: "99.00", purchasePriceDzd: "99.00", source: "PURCHASE_PRICE" }))
  await waitFor(() => expect(confirm().disabled).toBe(false))
  fireEvent.click(confirm())
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
  expect(submit.mock.calls[1]![0]).toEqual({ kind: "transferAsset", input: { requestId: "pending", assetUnitId: "b", toWarehouseId: undefined, toProjectId: "same", chargeAmountDzd: undefined, note: null } })
})
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
it.each([
  ["stock", "SALE"], ["definitions", "SALE"], ["stock", "TRANSFER"], ["definitions", "TRANSFER"],
] as const)("retains the same %s-dependent %s draft, blocks forced submission and retries", async (failedRead, mode) => {
  let offline = false
  const recovery = deferred<unknown>()
  const definitions = vi.fn(async () => {
    if (offline && failedRead === "definitions") throw new Error("definitions offline")
    return [definition]
  })
  const contents = vi.fn(async () => {
    if (offline && failedRead === "stock") throw new Error("stock offline")
    return stock
  })
  const { wrapper, query, transport } = setup(definitions, contents)
  const pageLocations = [locations[0]!, { id: "same", type: "PROJECT" as const, label: "Project" }]
  render(<ExactInventoryPage client={financialClient.inventory} locations={pageLocations} parties={parties} initialMovement />, { wrapper })
  const dialog = await screen.findByRole("dialog")
  const prefix = [...exactCommercePrefix(financialClient.inventory), "operator"]
  const stockKey = [...prefix, "location", { warehouseId: "same" }]
  const definitionKey = [...prefix, "definitions"]
  const failedKey = failedRead === "stock" ? stockKey : definitionKey
  await waitFor(() => {
    expect(query.getQueryState(stockKey)).toMatchObject({ status: "success", fetchStatus: "idle" })
    expect(query.getQueryState(definitionKey)).toMatchObject({ status: "success", fetchStatus: "idle" })
  })
  expect(query.getQueryCache().find({ queryKey: failedKey, exact: true })?.getObserversCount()).toBe(1)
  fireEvent.change(screen.getByRole("combobox", { name: "الوجهة" }), { target: { value: "PROJECT:same" } })
  fireEvent.change(pick(), { target: { value: "second" } })
  fireEvent.change(screen.getByRole("textbox", { name: "الكمية المحولة" }), { target: { value: "2" } })
  if (mode === "SALE") {
    fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "SALE" } })
    fireEvent.change(screen.getByRole("combobox", { name: "التسعير، اختياري" }), { target: { value: "PRICE" } })
    fireEvent.change(screen.getByRole("textbox", { name: "سعر الوحدة الخارجي" }), { target: { value: "12.3456" } })
  }
  const note = screen.getByRole("textbox", { name: "ملاحظة التحويل" }) as HTMLTextAreaElement
  fireEvent.change(note, { target: { value: "Keep this draft" } })
  const form = confirm().closest("form")!
  const writes = () => transport.mock.calls.filter(([path]) => ["financial.inventory.createOutbound", "financial.inventory.transferConsumable"].includes(path.join(".")))
  const assertDraft = () => {
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(confirm().closest("form")).toBe(form)
    expect((screen.getByRole("combobox", { name: "نوع العملية" }) as HTMLSelectElement).value).toBe(mode)
    expect(pick().value).toBe("second")
    expect((screen.getByRole("textbox", { name: "الكمية المحولة" }) as HTMLInputElement).value).toBe("2")
    expect(note.value).toBe("Keep this draft")
    expect(note.disabled).toBe(false)
    if (mode === "SALE") expect((screen.getByRole("textbox", { name: "سعر الوحدة الخارجي" }) as HTMLInputElement).value).toBe("12.3456")
    else expect((screen.getByRole("combobox", { name: "الوجهة" }) as HTMLSelectElement).value).toBe("PROJECT:same")
  }
  offline = true
  await act(async () => { await query.invalidateQueries({ queryKey: failedKey, exact: true }) })
  expect(query.getQueryState(failedKey)).toMatchObject({ status: "error", fetchStatus: "idle", data: failedRead === "stock" ? stock : [definition] })
  expect(failedRead === "stock" ? contents : definitions).toHaveBeenCalledTimes(2)
  expect((await screen.findByRole("alert")).textContent).toMatch(/./)
  assertDraft()
  expect(confirm().disabled).toBe(true)
  fireEvent.click(confirm())
  fireEvent.submit(form)
  await act(async () => {})
  expect(writes()).toHaveLength(0)
  offline = false
  if (failedRead === "stock") contents.mockImplementationOnce(() => recovery.promise as Promise<Contents>)
  else definitions.mockImplementationOnce(() => recovery.promise as Promise<typeof definition[]>)
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
  await waitFor(() => expect(query.getQueryState(failedKey)?.fetchStatus).toBe("fetching"))
  expect(confirm().disabled).toBe(true)
  fireEvent.submit(form)
  expect(writes()).toHaveLength(0)
  await act(async () => recovery.resolve(failedRead === "stock" ? stock : [definition]))
  await waitFor(() => expect(confirm().disabled).toBe(false))
  expect(screen.queryByRole("alert")).toBeNull()
  assertDraft()
  if (mode === "SALE") {
    fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "TRANSFER" } })
    expect((screen.getByRole("combobox", { name: "الوجهة" }) as HTMLSelectElement).value).toBe("PROJECT:same")
    fireEvent.change(screen.getByRole("combobox", { name: "نوع العملية" }), { target: { value: "SALE" } })
  }
  fireEvent.click(confirm())
  await waitFor(() => expect(writes()).toHaveLength(1))
  expect(writes()[0]![1]).toEqual(mode === "SALE" ? {
    requestId: expect.any(String), fromType: "WAREHOUSE", fromId: "same", transferType: "SALE", counterpartyId: "party", notes: "Keep this draft", debtAmountDzd: undefined, firstPaymentAmountDzd: undefined,
    items: [{ itemId: "material", optionId: "second", quantity: 2, unitPriceDzd: "12.3456", derivedPrice: undefined }],
  } : { requestId: expect.any(String), inventoryEntryId: "producer-second", quantity: 2, fromWarehouseId: "same", fromProjectId: undefined, toWarehouseId: undefined, toProjectId: "same", note: "Keep this draft" })
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
