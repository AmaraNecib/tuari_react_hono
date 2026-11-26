import { randomUUID } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createRouterClient } from "../../../../api/src/rpc/connected-test-client.test-fixture"
import type { AppClient } from "@tuari/contracts"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { createAppConfig } from "../../../../api/src/config"
import { createDatabaseConnection } from "../../../../api/src/infrastructure/database/factory"
import { createExperimentalInvoiceSettlementAppDependencies } from "../../../../api/src/app/fresh-exact-dependencies"
import { createRpcContext } from "../../../../api/src/rpc/context"
import { createRouter } from "../../../../api/src/rpc/router"
import { ExternalCounterpartyDetailsPage } from "../externals/external-details-page"
import { ManualSettlementPanel } from "./manual-settlement-panel"
import { ExperimentalInvoicesPage } from "../invoices/experimental-invoices-page"
import { sessionQueryKey } from "@/features/app-shell/workspace-keys"
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
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...props }: { children: React.ReactNode; to?: string; params?: Record<string, string> }) => {
    const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, encodeURIComponent(value)), to ?? "")
    return <a {...props} href={href}>{children}</a>
  },
}))

const disposers: (() => void)[] = []
const queries: QueryClient[] = []
afterEach(() => {
  cleanup()
  disposers.splice(0).reverse().forEach(dispose => dispose())
  queries.splice(0).forEach(query => query.clear())
  state.client = null
  state.user = null
  sessionStorage.clear()
  vi.restoreAllMocks()
})

async function createFixture() {
  vi.stubEnv("TUARI_LICENSE_STATUS", "trial")
  const databasePath = join(mkdtempSync(join(tmpdir(), "tuari-experimental-settlement-ui-")), "app.sqlite")
  const config = createAppConfig({ BETTER_AUTH_SECRET: "kV8xQ2mR9fT3zLpW6nY4aB7cD0eF1gH2jK5sA8dN3uM", DB_ADAPTER: "sqlite" })
  const root = await createExperimentalInvoiceSettlementAppDependencies({ databasePath, databaseKey: "" }, config)
  disposers.push(() => root.close())
  const owner = await root.authBootstrapService.bootstrapFirstUser({ name: "Invoice owner", phone: "0612345601", password: "password123" })
  if (!owner.success) throw new Error("Owner bootstrap failed")
  const adapter = (await root.auth.$context).internalAdapter as unknown as { createSession(id: string): Promise<{ token: string }> }
  const clientFor = async (userId: string) => {
    const session = await adapter.createSession(userId)
    return createRouterClient(createRouter(root), {
      context: createRpcContext(new Headers({ authorization: `Bearer ${session.token}` }), root.sessionService),
    }) as AppClient
  }
  const ownerClient = await clientFor(owner.item.id)
  const party = await ownerClient.externalCounterpartiesCreate({ fullName: "Experimental invoice party", phoneNumber: "0555123601" })
  if (!party.success) throw new Error("Counterparty creation failed")
  const draft = await ownerClient.financial.experimentalInvoices.createInvoice({
    requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    supplierName: "Experimental supplier", invoiceNumber: "EXP-615-UI", direction: "PURCHASE",
    lineItems: [{ description: "Materials", source: { mode: "agreed-total", total: "100.00", quantity: "1" } }],
  })
  const invoice = await ownerClient.financial.experimentalInvoices.receiveInvoice({ requestId: randomUUID(), id: draft.id })
  const payment = await ownerClient.financial.experimentalInvoices.createPayment({
    requestId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: party.item.id,
    direction: "PURCHASE", paymentDate: "2026-11-20T00:00:00.000Z", paymentMethod: "BANK_TRANSFER", totalAmount: "20.00",
    allocations: [{ invoiceId: invoice.id, amount: "20.00" }],
  })
  const receivable = await ownerClient.financial.debts.create({
    requestId: randomUUID(), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: party.item.id,
    direction: "RECEIVABLE", openingBalanceDzd: "80.00", reasonCategory: "OTHER", reasonDetail: "Experimental settlement counterpart",
  })
  const receivableOriginalId = (await ownerClient.financial.debts.detail({ id: receivable.id })).entries[0]!.id
  const db = createDatabaseConnection(databasePath, "")
  disposers.push(() => db.close())
  const userId = randomUUID()
  const employeeId = randomUUID()
  const phone = "0555000615"
  const now = new Date().toISOString()
  const workerRole = root.workforceService.listRoles().items.find(role => role.key === "worker")
  if (!workerRole) throw new Error("Worker role fixture is unavailable")
  db.prepare('INSERT INTO user(id,name,"phoneNumber",created_at,updated_at) VALUES (?,?,?,?,?)').run(userId, "Debt operator", phone, now, now)
  db.prepare("INSERT INTO employee(id,first_name,last_name,phone,role_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)").run(employeeId, "Debt", "Operator", phone, workerRole.id, now, now)
  db.prepare("DELETE FROM role_permission WHERE role_id=?").run(workerRole.id)
  const permissions = ["debts:read", "debts:settle", "debts:update", "invoices:read"]
  const grant = (permission: string) => db.prepare("INSERT INTO role_permission(id,role_id,permission,created_at,updated_at) VALUES (?,?,?,?,?)").run(randomUUID(), workerRole.id, permission, now, now)
  for (const permission of permissions) grant(permission)
  const operator = { userId, roleId: workerRole.id }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  query.setQueryData(sessionQueryKey, { user: { id: owner.item.id, name: owner.item.name, phone: owner.item.phone, version: "0.0.0" } })
  queries.push(query)
  return { root, db, owner: owner.item, ownerClient, operator, clientFor, party: party.item, invoice, payment, receivable, receivableOriginalId, query }
}

function bindClient(client: AppClient, user: { id: string; name: string | null; phone: string }) {
  const metadata = vi.fn(client.financial.metadata)
  const manual = client.financial.manualSettlement
  const experimental = client.financial.experimentalSettlement
  const experimentalInvoices = client.financial.experimentalInvoices
  const bound = {
    financial: {
      debts: client.financial.debts,
      invoices: client.financial.invoices,
      inventory: client.financial.inventory,
      expenses: client.financial.expenses,
      reports: client.financial.reports,
      metadata,
      manualSettlement: {
        candidates: manual.candidates, preview: manual.preview, confirm: manual.confirm, reverse: manual.reverse,
        history: vi.fn(manual.history), accountHistory: vi.fn(manual.accountHistory),
      },
      experimentalSettlement: {
        candidates: vi.fn(experimental.candidates), history: vi.fn(experimental.history), accountHistory: vi.fn(experimental.accountHistory),
        preview: vi.fn(experimental.preview), confirm: vi.fn(experimental.confirm), reverse: vi.fn(experimental.reverse),
      },
      experimentalInvoices: {
        listInvoices: vi.fn(experimentalInvoices.listInvoices), getInvoice: vi.fn(experimentalInvoices.getInvoice),
        createInvoice: experimentalInvoices.createInvoice, updateInvoice: experimentalInvoices.updateInvoice,
        receiveInvoice: experimentalInvoices.receiveInvoice, voidInvoice: experimentalInvoices.voidInvoice,
        createPayment: experimentalInvoices.createPayment, getPayment: vi.fn(experimentalInvoices.getPayment),
        listPayments: vi.fn(experimentalInvoices.listPayments), voidPayment: experimentalInvoices.voidPayment,
      },
    },
  } as unknown as AppClient
  if (!bound.financial.debts || typeof bound.financial.debts !== "object") throw new Error("Bound debt client is unavailable")
  state.client = bound
  state.user = { ...user, name: user.name ?? user.phone, version: "0.0.0" }
  return bound
}

function mountOwner(f: Awaited<ReturnType<typeof createFixture>>, client: AppClient) {
  const bound = bindClient(client, f.owner)
  const detail = <ExperimentalInvoicesPage
    client={bound.financial.experimentalInvoices}
    initialInvoiceId={f.invoice.id}
    onBackToList={() => {}}
    onOpenInvoice={() => {}}
  />
  render(<QueryClientProvider client={f.query}>
    <ExternalCounterpartyDetailsPage
      counterparty={f.party}
      debtClient={bound.financial.debts}
      manualSettlementClient={bound.financial.manualSettlement}
      experimentalSettlementClient={bound.financial.experimentalSettlement}
      experimentalInvoicesClient={bound.financial.experimentalInvoices}
    />
    {detail}
  </QueryClientProvider>)
  return bound
}

it("confirms and reverses an invoice settlement, refreshes the mounted detail, and links invoice history to the experimental route", async () => {
  const f = await createFixture()
  const bound = mountOwner(f, f.ownerClient)
  const invoiceClient = bound.financial.experimentalInvoices
  await screen.findByRole("heading", { name: "تفاصيل الفاتورة EXP-615-UI" })
  expect(screen.getByText("مستلمة")).toBeTruthy()
  const initialReads = vi.mocked(invoiceClient.getInvoice).mock.calls.length
  await waitFor(() => expect(vi.mocked(invoiceClient.listPayments)).toHaveBeenCalled())
  const initialPaymentReads = vi.mocked(invoiceClient.listPayments).mock.calls.length

  fireEvent.click(await screen.findByRole("tab", { name: "التسويات" }))
  fireEvent.click(await screen.findByRole("button", { name: "تسجيل تسوية بين حسابين" }))
  const dialog = await screen.findByRole("dialog")
  const payable = within(dialog).getByRole("combobox", { name: "الدين المستحق علينا" })
  await waitFor(() => expect(payable.querySelector(`option[value="${f.invoice.debtEntryId}"]`)).not.toBeNull())
  fireEvent.change(within(dialog).getByRole("combobox", { name: "الدين المستحق علينا" }), { target: { value: f.invoice.debtEntryId } })
  fireEvent.change(within(dialog).getByRole("combobox", { name: "الدين المستحق لنا" }), { target: { value: f.receivableOriginalId } })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ التسوية المتبادلة" }), { target: { value: "80" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "معاينة التسوية المتبادلة" }))
  fireEvent.click(await within(dialog).findByRole("button", { name: "تأكيد التسوية المتبادلة" }))
  await waitFor(() => expect(bound.financial.experimentalSettlement.confirm).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }))

  await screen.findByText("مسوّاة بالكامل")
  await waitFor(() => expect(vi.mocked(invoiceClient.getInvoice).mock.calls.length).toBeGreaterThan(initialReads))
  await waitFor(() => expect(vi.mocked(invoiceClient.listPayments).mock.calls.length).toBeGreaterThan(initialPaymentReads))
  const paymentReadsBeforeReverse = vi.mocked(invoiceClient.listPayments).mock.calls.length
  const settlementArticle = await screen.findByRole("article", { name: "تسوية مسجلة" })
  const invoiceLink = within(settlementArticle).getByRole("link", { name: /EXP-615-UI/ })
  expect(invoiceLink.getAttribute("href")).toBe(`/experimental/invoices/${encodeURIComponent(f.invoice.id)}`)
  expect(settlementArticle.textContent).toContain("اعكس هذه التسوية قبل إلغاء الفاتورة المرتبطة بها.")

  const readsBeforeReverse = vi.mocked(invoiceClient.getInvoice).mock.calls.length
  fireEvent.click(within(settlementArticle).getByRole("button", { name: "عكس التسوية كاملة" }))
  const reason = await screen.findByRole("textbox", { name: "سبب العكس" })
  fireEvent.change(reason, { target: { value: "Correct the paired balance" } })
  fireEvent.click(screen.getByRole("button", { name: "تأكيد العكس الكامل" }))
  await screen.findByText("مستلمة")
  await waitFor(() => expect(vi.mocked(invoiceClient.getInvoice).mock.calls.length).toBeGreaterThan(readsBeforeReverse))
  await waitFor(() => expect(vi.mocked(invoiceClient.listPayments).mock.calls.length).toBeGreaterThan(paymentReadsBeforeReverse))
  const restored = await f.ownerClient.financial.experimentalInvoices.getInvoice({ id: f.invoice.id })
  expect(restored).toMatchObject({ totalAmount: "100.00", paidAmount: "20.00", settledAmount: "0.00", remainingAmount: "80.00", status: "RECEIVED" })
  expect((await f.ownerClient.financial.experimentalInvoices.getPayment({ id: f.payment.id })).allocations).toEqual(f.payment.allocations)
})

it("keeps non-owner invoice sources restricted and refuses confirmation after the debt grant is revoked", async () => {
  const f = await createFixture()
  const operatorClient = await f.clientFor(f.operator.userId)
  const bound = bindClient(operatorClient, { id: f.operator.userId, name: "Debt operator", phone: "0555000615" })
  const operatorQuery = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  operatorQuery.setQueryData(sessionQueryKey, { user: { id: f.operator.userId, name: "Debt operator", phone: "0555000615", version: "0.0.0" } })
  queries.push(operatorQuery)
  await expect(operatorClient.financial.experimentalInvoices.getInvoice({ id: f.invoice.id })).rejects.toMatchObject({ code: "UNAUTHORIZED" })

  const settlementClient = { kind: "experimental" as const, client: bound.financial.experimentalSettlement, invoices: bound.financial.experimentalInvoices }
  render(<QueryClientProvider client={operatorQuery}>
    <ManualSettlementPanel client={settlementClient} debtClient={bound.financial.debts} partyId={f.party.id} />
  </QueryClientProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "تسجيل تسوية بين حسابين" }))
  const dialog = await screen.findByRole("dialog")
  const payable = within(dialog).getByRole("combobox", { name: "الدين المستحق علينا" })
  await waitFor(() => expect(payable.querySelector(`option[value="${f.invoice.debtEntryId}"]`)).not.toBeNull())
  expect(payable.querySelector(`option[value="${f.invoice.debtEntryId}"]`)?.textContent).toContain("مصدر مقيّد العرض")
  fireEvent.change(within(dialog).getByRole("combobox", { name: "الدين المستحق علينا" }), { target: { value: f.invoice.debtEntryId } })
  fireEvent.change(within(dialog).getByRole("combobox", { name: "الدين المستحق لنا" }), { target: { value: f.receivableOriginalId } })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ التسوية المتبادلة" }), { target: { value: "80" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "معاينة التسوية المتبادلة" }))
  await within(dialog).findByText(/صافي الموقف لا يتغير/)
  const before = {
    invoice: await f.ownerClient.financial.experimentalInvoices.getInvoice({ id: f.invoice.id }),
    receivable: await f.ownerClient.financial.debts.detail({ id: f.receivable.id }),
  }
  f.db.prepare("DELETE FROM role_permission WHERE role_id=? AND permission='debts:settle'").run(f.operator.roleId)
  fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد التسوية المتبادلة" }))
  await waitFor(() => expect(bound.financial.experimentalSettlement.confirm).toHaveBeenCalledTimes(1))
  const after = {
    invoice: await f.ownerClient.financial.experimentalInvoices.getInvoice({ id: f.invoice.id }),
    receivable: await f.ownerClient.financial.debts.detail({ id: f.receivable.id }),
  }
  expect(after).toEqual(before)
  expect(document.body.textContent).not.toContain(f.invoice.id)
  expect(document.body.textContent).not.toContain("EXP-615-UI")
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }))
  await f.ownerClient.financial.experimentalSettlement.confirm({
    requestId: randomUUID(), externalCounterpartyId: f.party.id,
    payableOriginalEntryId: f.invoice.debtEntryId!, receivableOriginalEntryId: f.receivableOriginalId,
    currency: "DZD", amountDzd: "80.00", expectedPayableRemainingDzd: "80.00", expectedReceivableRemainingDzd: "80.00",
  })
  await operatorQuery.invalidateQueries({ queryKey: ["manual-settlement"] })
  const restrictedHistory = await screen.findByRole("article", { name: "تسوية مسجلة" })
  expect(restrictedHistory.textContent).toContain("مصدر مقيّد العرض")
  expect(restrictedHistory.querySelector("a")).toBeNull()
  expect(restrictedHistory.textContent).not.toContain(f.invoice.id)
  expect(restrictedHistory.textContent).not.toContain("EXP-615-UI")
})

it("does not issue experimental reads when the server reports an incomplete capability pair", async () => {
  const f = await createFixture()
  const bound = bindClient(f.ownerClient, f.owner)
  const metadata = vi.mocked(bound.financial.metadata)
  const candidates = vi.mocked(bound.financial.experimentalSettlement.candidates)
  const detailReads = vi.mocked(bound.financial.experimentalInvoices.getInvoice)
  metadata.mockResolvedValue({ ...(await f.ownerClient.financial.metadata()), capabilities: { manualSettlement: true, experimentalInvoiceSettlement: false, experimentalSettlement: true } } as never)
  render(<QueryClientProvider client={f.query}>
    <ExternalCounterpartyDetailsPage
      counterparty={f.party}
      debtClient={bound.financial.debts}
      manualSettlementClient={bound.financial.manualSettlement}
      experimentalSettlementClient={bound.financial.experimentalSettlement}
      experimentalInvoicesClient={bound.financial.experimentalInvoices}
    />
  </QueryClientProvider>)
  fireEvent.click(await screen.findByRole("tab", { name: "التسويات" }))
  await screen.findByRole("button", { name: "تسوية متبادلة جديدة" })
  expect(candidates).not.toHaveBeenCalled()
  expect(detailReads).not.toHaveBeenCalled()
})
