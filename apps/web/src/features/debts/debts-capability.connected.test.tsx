import { randomUUID } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRouterClient } from "../../../../api/src/rpc/connected-test-client.test-fixture"
import type { AppClient } from "@tuari/contracts"
import { cleanup, fireEvent, within, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { createFreshExactAppDependencies } from "../../../../api/src/app/fresh-exact-dependencies"
import { createAppConfig } from "../../../../api/src/config"
import { createRouter } from "../../../../api/src/rpc/router"
import { createRpcContext } from "../../../../api/src/rpc/context"
import { ExternalCounterpartyDetailsPage } from "../externals/external-details-page"
import { ExactFinancialRoutePage } from "../shared/exact-financial-route"
import "@/i18n"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"

const state = vi.hoisted(() => ({ client: null as AppClient | null, user: null as { id: string; name: string; phone: string; version: string } | null }))
vi.mock("@/lib/orpc-client", async importOriginal => ({ ...await importOriginal<object>(), financialClient: new Proxy({}, { get: (_, key) => Reflect.get(state.client!.financial, key) }) }))
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: state.user } }) }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
const disposers: (() => void)[] = []
afterEach(() => { cleanup(); disposers.splice(0).reverse().forEach(close => close()); state.user = null; vi.unstubAllEnvs() })

async function setup(enabled: boolean) {
  vi.stubEnv("TUARI_LICENSE_STATUS", "trial")
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-capability-ui-")), "app.sqlite")
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" })
  const root = await createFreshExactAppDependencies({ databasePath, databaseKey: "", ...(enabled ? { disposableManualSettlement: true } : {}) }, config)
  disposers.push(() => root.close())
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Owner", phone: "0612345678", password: "password123" })
  if (!owner.success) throw new Error("Bootstrap failed")
  state.user = { id: owner.item.id, name: "Owner", phone: "0612345678", version: "0.0.0" }
  const session = await (await root.auth.$context).internalAdapter.createSession(owner.item.id)
  const client = createRouterClient(createRouter(root), { context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService) }) as AppClient
  const manual = client.financial.manualSettlement
  const history = vi.fn(manual.accountHistory)
  const partyHistory = vi.fn(manual.history)
  const metadata = vi.fn(client.financial.metadata)
  const financial = { debts: client.financial.debts, invoices: client.financial.invoices, inventory: client.financial.inventory, expenses: client.financial.expenses, reports: client.financial.reports, metadata, manualSettlement: { candidates: manual.candidates, preview: manual.preview, confirm: manual.confirm, reverse: manual.reverse, accountHistory: history, history: partyHistory } } as AppClient["financial"]
  const bound = { financial } as AppClient
  state.client = bound
  const party = await client.externalCounterpartiesCreate({ fullName: "Connected supplier", phoneNumber: "0555123999" })
  if (!party.success) throw new Error("Party creation failed")
  const account = await client.financial.debts.create({ requestId: randomUUID(), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id, direction: "PAYABLE", openingBalanceDzd: "100.00" })
  await client.financial.debts.settle({ requestId: randomUUID(), debtAccountId: account.id, note: "Original zeroing history" })

  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  query.setQueryData(sessionQueryKey, { user: state.user })
  disposers.push(() => query.clear())
  return { client: bound, party: party.item, account, history, partyHistory, metadata, query }
}

it.each(["external", "debts"])("default-off %s route retains original tabs, zeroing and history without manual queries", async route => {
  const f = await setup(false)
  render(<QueryClientProvider client={f.query}>{route === "external"
    ? <ExternalCounterpartyDetailsPage counterparty={f.party} debtClient={f.client.financial.debts} manualSettlementClient={f.client.financial.manualSettlement} />
    : <ExactFinancialRoutePage route="debts" parties={[{ id: f.party.id, label: f.party.fullName, type: "EXTERNAL_COUNTERPARTY" }]} locations={[]} expenses={{ projects: [], employees: [], sellers: [] }} />}</QueryClientProvider>)
  fireEvent.click(await screen.findByRole("button", { name: /Connected supplier ·/ }))
  await screen.findByRole("region", { name: "جدول حركات الدين" })
  fireEvent.click(screen.getByRole("tab", { name: "التسوية وسجلها" }))
  await screen.findByText(/Original zeroing history/)
  expect(screen.getByRole("button", { name: "تصفير رصيد الحساب" })).toBeTruthy()
  expect(screen.getAllByRole("tab")).toHaveLength(4)
  await waitFor(() => expect(f.metadata).toHaveBeenCalledTimes(1))
  expect(f.history).not.toHaveBeenCalled()
  expect(f.partyHistory).not.toHaveBeenCalled()
  expect(screen.queryByRole("alert")).toBeNull()
})

it("default-off route still posts, pays and zeroes through the real ordinary command handlers", async () => {
  const f = await setup(false)
  render(<QueryClientProvider client={f.query}><ExternalCounterpartyDetailsPage counterparty={f.party} debtClient={f.client.financial.debts} manualSettlementClient={f.client.financial.manualSettlement} /></QueryClientProvider>)
  fireEvent.click(await screen.findByRole("button", { name: /Connected supplier ·/ }))
  await screen.findByRole("region", { name: "جدول حركات الدين" })
  fireEvent.click(screen.getByRole("button", { name: "تسجيل قيد" }))
  let dialog = await screen.findByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الحركة، موجب أو سالب" }), { target: { value: "50" } })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "السبب، مطلوب" }), { target: { value: "New ordinary obligation" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  fireEvent.click(await screen.findByRole("button", { name: "تسجيل دفعة" }))
  dialog = await screen.findByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "10" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect((await f.client.financial.debts.detail({ id: f.account.id })).account.currentBalance).toBe("40.00")
  fireEvent.click(screen.getByRole("tab", { name: "التسوية وسجلها" }))
  fireEvent.click(screen.getByRole("button", { name: "تصفير رصيد الحساب" }))
  dialog = await screen.findByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  const detail = await f.client.financial.debts.detail({ id: f.account.id })
  expect(detail.account.currentBalance).toBe("0.00")
  expect(detail.entries.filter(row => row.entryType === "SETTLEMENT")).toHaveLength(2)
  expect(f.history).not.toHaveBeenCalled()
  expect(f.partyHistory).not.toHaveBeenCalled()
  expect(f.metadata.mock.calls.length).toBeLessThanOrEqual(2)
})

it("older metadata without a support field keeps the legacy layout despite a complete RPC namespace", async () => {
  const f = await setup(true)
  const metadata = await f.metadata()
  delete metadata.capabilities
  f.metadata.mockResolvedValue(metadata)
  render(<QueryClientProvider client={f.query}><ExternalCounterpartyDetailsPage counterparty={f.party} debtClient={f.client.financial.debts} manualSettlementClient={f.client.financial.manualSettlement} /></QueryClientProvider>)
  await screen.findByRole("button", { name: /Connected supplier ·/ })
  expect(screen.getByRole("tab", { name: "التسوية وسجلها" })).toBeTruthy()
  expect(f.partyHistory).not.toHaveBeenCalled()
  expect(f.history).not.toHaveBeenCalled()
})

it("metadata transport errors do not activate manual history or replace legacy tabs", async () => {
  const f = await setup(true)
  f.metadata.mockRejectedValue(new Error("Metadata transport failed"))
  render(<QueryClientProvider client={f.query}><ExternalCounterpartyDetailsPage counterparty={f.party} debtClient={f.client.financial.debts} manualSettlementClient={f.client.financial.manualSettlement} /></QueryClientProvider>)
  await waitFor(() => expect(f.metadata).toHaveBeenCalled())
  expect(screen.getByRole("tab", { name: "التسوية وسجلها" })).toBeTruthy()
  expect(f.partyHistory).not.toHaveBeenCalled()
  expect(f.history).not.toHaveBeenCalled()
})

it("explicit server opt-in uses the approved scoped tabs and real history", async () => {
  const f = await setup(true)
  render(<QueryClientProvider client={f.query}><ExternalCounterpartyDetailsPage counterparty={f.party} debtClient={f.client.financial.debts} manualSettlementClient={f.client.financial.manualSettlement} /></QueryClientProvider>)
  fireEvent.click(await screen.findByRole("tab", { name: "التسويات" }))
  await screen.findByRole("button", { name: "تسوية متبادلة جديدة" })
  expect(screen.getAllByRole("tab")).toHaveLength(3)
  expect(f.partyHistory).toHaveBeenCalledTimes(1)
  expect(f.metadata).toHaveBeenCalledTimes(1)
})
