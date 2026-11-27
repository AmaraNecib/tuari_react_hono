// @vitest-environment jsdom
import { randomUUID } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRouterClient } from "../../../../api/src/rpc/connected-test-client.test-fixture"
import type { AppClient } from "@tuari/contracts"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { createExperimentalInvoiceSettlementAppDependencies } from "../../../../api/src/app/fresh-exact-dependencies"
import { createFreshExactAppDependencies } from "../../../../api/src/app/fresh-exact-dependencies"
import { createAppConfig } from "../../../../api/src/config"
import { createDatabaseConnection } from "../../../../api/src/infrastructure/database/factory"
import { createRpcContext } from "../../../../api/src/rpc/context"
import { createRouter } from "../../../../api/src/rpc/router"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
import { ExperimentalInvoicesPage } from "./experimental-invoices-page"
import { workspaceRoutes } from "@/router/navigation"
import "@/i18n"

const state = vi.hoisted(() => ({
  client: null as AppClient | null,
  user: null as { id: string; name: string; phone: string; version: string } | null,
}))
vi.mock("@/lib/orpc-client", async importOriginal => ({
  ...await importOriginal<object>(),
  financialClient: new Proxy({}, { get: (_, key) => Reflect.get(state.client!.financial, key) }),
}))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: state.user } }) }))

const disposers: (() => void)[] = []
afterEach(() => {
  cleanup()
  disposers.splice(0).reverse().forEach(close => close())
  state.user = null
  state.client = null
  vi.unstubAllEnvs()
})

const appConfig = () => createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" })
const tempDatabasePath = () => join(mkdtempSync(join(tmpdir(), "tuari-615-experimental-ui-")), "app.sqlite")
type SelectedTestRoot = Awaited<ReturnType<typeof createFreshExactAppDependencies>> | Awaited<ReturnType<typeof createExperimentalInvoiceSettlementAppDependencies>>
const clientFor = (root: SelectedTestRoot, token: string) => createRouterClient(createRouter(root), {
  context: createRpcContext(new Headers({ authorization: `Bearer ${token}` }), root.sessionService),
}) as AppClient
const sessionAdapter = async (root: { auth: { $context: Promise<unknown> } }) => (await root.auth.$context as {
  internalAdapter: { createSession(id: string): Promise<{ token: string }> }
}).internalAdapter
function queryClient(user: NonNullable<typeof state.user>) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  query.setQueryData(sessionQueryKey, { user })
  disposers.push(() => query.clear())
  return query
}
it("renders exact settlement balances, isolates list cache by client, and loads routed allocations", async () => {
  vi.stubEnv("TUARI_LICENSE_STATUS", "trial")
  const root = await createExperimentalInvoiceSettlementAppDependencies({ databasePath: tempDatabasePath(), databaseKey: "" }, appConfig())
  disposers.push(() => root.close())
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "UI owner", phone: "0612345615", password: "password123" })
  if (!owner.success) throw new Error("Owner bootstrap failed")
  state.user = { id: owner.item.id, name: "UI owner", phone: "0612345615", version: "0.0.0" }
  const session = await (await sessionAdapter(root)).createSession(owner.item.id)
  const raw = clientFor(root, session.token)
  state.client = raw
  const query = queryClient(state.user)
  const client = raw.financial.experimentalInvoices
  const party = await raw.externalCounterpartiesCreate({ fullName: "Connected invoice supplier", phoneNumber: "0555123615" })
  if (!party.success) throw new Error("Counterparty creation failed")

  const draft = await client.createInvoice({
    requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    supplierName: "Connected invoice supplier", invoiceNumber: "EXP-615-UI-SETTLED", direction: "PURCHASE",
    lineItems: [{ description: "Settlement material", source: { mode: "agreed-total", total: "100.25", quantity: "1" } }],
  })
  const received = await client.receiveInvoice({ requestId: randomUUID(), id: draft.id })
  await client.createPayment({
    requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    direction: "PURCHASE", paymentDate: "2026-11-20T00:00:00.000Z", paymentMethod: "BANK_TRANSFER", totalAmount: "30.50",
    allocations: [{ invoiceId: received.id, amount: "20.25" }],
  })
  const manual = await raw.financial.debts.create({ requestId: randomUUID(), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction: "RECEIVABLE", openingBalanceDzd: "80.00", reasonCategory: "OTHER", reasonDetail: "UI settlement fixture" })
  const manualOriginalId = (await raw.financial.debts.detail({ id: manual.id })).entries[0]!.id
  const pair = { externalCounterpartyId: party.item.id, payableOriginalEntryId: received.debtEntryId!, receivableOriginalEntryId: manualOriginalId, currency: "DZD" as const, amountDzd: "80.00" }
  const preview = await raw.financial.manualSettlement.preview(pair)
  await raw.financial.manualSettlement.confirm({ ...pair, requestId: randomUUID(), expectedPayableRemainingDzd: preview.payableRemainingDzd, expectedReceivableRemainingDzd: preview.receivableRemainingDzd })

  const paidDraft = await client.createInvoice({
    requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    supplierName: "Connected invoice supplier", invoiceNumber: "EXP-615-UI-PAID", direction: "SALE",
    lineItems: [{ description: "Full payment material", source: { mode: "agreed-total", total: "50.25", quantity: "1" } }],
  })
  const paidInvoice = await client.receiveInvoice({ requestId: randomUUID(), id: paidDraft.id })
  await client.createPayment({
    requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    direction: "SALE", paymentDate: "2026-11-21T00:00:00.000Z", paymentMethod: "CHECK", totalAmount: "50.25",
    allocations: [{ invoiceId: paidInvoice.id, amount: "50.25" }],
  })

  const onOpenInvoice = vi.fn()
  const view = render(<QueryClientProvider client={query}><ExperimentalInvoicesPage client={client} onBackToList={vi.fn()} onOpenInvoice={onOpenInvoice} /></QueryClientProvider>)
  const table = await screen.findByRole("region", { name: "جدول الفواتير العادية التجريبية" })
  const settledRow = within(table).getByText("EXP-615-UI-SETTLED").closest("tr")!
  expect(settledRow.textContent).toContain("20.25")
  expect(settledRow.textContent).toContain("80")
  expect(settledRow.textContent).toContain("0")
  expect(settledRow.textContent).toContain("مسوّاة بالكامل")
  const paidRow = within(table).getByText("EXP-615-UI-PAID").closest("tr")!
  expect(paidRow.textContent).toContain("مدفوعة بالكامل فعليًا")
  expect(paidRow.textContent).toContain("50.25")

  const secondClientList = vi.fn((input: Parameters<typeof client.listInvoices>[0]) => client.listInvoices(input))
  const secondClient = { ...client, listInvoices: secondClientList }
  view.rerender(<QueryClientProvider client={query}><ExperimentalInvoicesPage client={secondClient} onBackToList={vi.fn()} onOpenInvoice={onOpenInvoice} /></QueryClientProvider>)
  expect(await screen.findByText("EXP-615-UI-SETTLED")).toBeTruthy()
  expect(secondClientList).toHaveBeenCalled()
  const clientScopedTable = screen.getByRole("region", { name: "جدول الفواتير العادية التجريبية" })
  const clientScopedRow = within(clientScopedTable).getByText("EXP-615-UI-SETTLED").closest("tr")!

  fireEvent.click(within(clientScopedRow).getByRole("button", { name: "تفاصيل EXP-615-UI-SETTLED" }))
  expect(onOpenInvoice).toHaveBeenCalledWith(received.id)
  view.rerender(<QueryClientProvider client={query}><ExperimentalInvoicesPage client={client} initialInvoiceId={received.id} onBackToList={vi.fn()} onOpenInvoice={onOpenInvoice} /></QueryClientProvider>)
  expect(await screen.findByRole("heading", { name: "تفاصيل الفاتورة EXP-615-UI-SETTLED" })).toBeTruthy()
  expect(await screen.findByText(/Settlement material/)).toBeTruthy()
  const allocationSurface = screen.getByRole("region", { name: "الدفعات والتوزيع الفعلي" })
  expect(allocationSurface.textContent).toContain("20.25")
  expect(allocationSurface.textContent).toContain("10.25")
  expect(allocationSurface.textContent).toContain("غير موزع")
  expect(workspaceRoutes.experimentalInvoiceDetails(received.id)).toEqual({ to: "/experimental/invoices/$invoiceId", params: { invoiceId: received.id } })
})

it("does not call experimental invoice RPCs when the explicit server capability is false", async () => {
  vi.stubEnv("TUARI_LICENSE_STATUS", "trial")
  const root = await createFreshExactAppDependencies({ databasePath: tempDatabasePath(), databaseKey: "" }, appConfig())
  disposers.push(() => root.close())
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Normal owner", phone: "0612345616", password: "password123" })
  if (!owner.success) throw new Error("Owner bootstrap failed")
  state.user = { id: owner.item.id, name: "Normal owner", phone: "0612345616", version: "0.0.0" }
  const session = await (await sessionAdapter(root)).createSession(owner.item.id)
  const raw = clientFor(root, session.token)
  const listInvoices = vi.fn(raw.financial.experimentalInvoices.listInvoices)
  const getInvoice = vi.fn(raw.financial.experimentalInvoices.getInvoice)
  const financial = { ...raw.financial, experimentalInvoices: { ...raw.financial.experimentalInvoices, listInvoices, getInvoice } }
  state.client = { ...raw, financial } as AppClient
  const query = queryClient(state.user)
  render(<QueryClientProvider client={query}><ExperimentalInvoicesPage client={financial.experimentalInvoices} initialInvoiceId="unsupported-id" onBackToList={vi.fn()} onOpenInvoice={vi.fn()} /></QueryClientProvider>)
  expect((await screen.findByRole("alert")).textContent).toContain("فواتير التسوية التجريبية غير متاحة لهذا الحساب.")
  expect(listInvoices).not.toHaveBeenCalled()
  expect(getInvoice).not.toHaveBeenCalled()
})

it("hides an owner's cached invoice when the session changes to a non-owner whose authenticated RPC is denied", async () => {
  vi.stubEnv("TUARI_LICENSE_STATUS", "trial")
  const databasePath = tempDatabasePath()
  const root = await createExperimentalInvoiceSettlementAppDependencies({ databasePath, databaseKey: "" }, appConfig())
  disposers.push(() => root.close())
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Cache owner", phone: "0612345617", password: "password123" })
  if (!owner.success) throw new Error("Owner bootstrap failed")
  const authAdapter = await sessionAdapter(root)
  const ownerSession = await authAdapter.createSession(owner.item.id)
  const ownerClient = clientFor(root, ownerSession.token)
  const party = await ownerClient.externalCounterpartiesCreate({ fullName: "Private owner invoice", phoneNumber: "0555123617" })
  if (!party.success) throw new Error("Counterparty creation failed")
  const client = ownerClient.financial.experimentalInvoices
  const draft = await client.createInvoice({ requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id, supplierName: "Private owner invoice", invoiceNumber: "OWNER-CACHED-615", direction: "PURCHASE", lineItems: [{ description: "Private line", source: { mode: "agreed-total", total: "12.00", quantity: "1" } }] })
  await client.receiveInvoice({ requestId: randomUUID(), id: draft.id })
  state.user = { id: owner.item.id, name: "Cache owner", phone: "0612345617", version: "0.0.0" }
  state.client = ownerClient
  const query = queryClient(state.user)
  const view = render(<QueryClientProvider client={query}><ExperimentalInvoicesPage client={client} onBackToList={vi.fn()} onOpenInvoice={vi.fn()} /></QueryClientProvider>)
  expect(await screen.findByText("OWNER-CACHED-615")).toBeTruthy()

  const db = createDatabaseConnection(databasePath, "")
  disposers.push(() => db.close())
  const nonOwnerId = randomUUID()
  const phone = "+213555000617"
  const now = new Date().toISOString()
  db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)').run(nonOwnerId, "Non-owner", phone, now, now)
  const nonOwnerSession = await authAdapter.createSession(nonOwnerId)
  const nonOwnerRaw = clientFor(root, nonOwnerSession.token)
  const deniedList = vi.fn(nonOwnerRaw.financial.experimentalInvoices.listInvoices)
  const nonOwnerFinancial = { ...nonOwnerRaw.financial, experimentalInvoices: { ...nonOwnerRaw.financial.experimentalInvoices, listInvoices: deniedList } }
  const nonOwner = { ...nonOwnerRaw, financial: nonOwnerFinancial } as AppClient
  state.user = { id: nonOwnerId, name: "Non-owner", phone, version: "0.0.0" }
  state.client = nonOwner
  query.setQueryData(sessionQueryKey, { user: state.user })
  view.rerender(<QueryClientProvider client={query}><ExperimentalInvoicesPage client={nonOwner.financial.experimentalInvoices} onBackToList={vi.fn()} onOpenInvoice={vi.fn()} /></QueryClientProvider>)
  await screen.findByRole("alert")
  expect(screen.getByRole("alert").textContent).toContain("فواتير التسوية التجريبية غير متاحة لهذا الحساب.")
  expect(screen.queryByText("OWNER-CACHED-615")).toBeNull()
  expect(deniedList).not.toHaveBeenCalled()
})
