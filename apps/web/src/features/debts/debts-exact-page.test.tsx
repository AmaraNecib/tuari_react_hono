// @vitest-environment jsdom
import "@/i18n"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactDebtAccount, ExactDebtDetail, ExactDebtsClient } from "@tuari/contracts"
import { sessionQueryKey, workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"
import { ExactDebtsPage, type ExactDebtPartyOption } from "./debts-exact-page"
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
const party = { id: "00000000-0000-4000-8000-000000000999", label: "المورد أحمد", partyType: "EXTERNAL_COUNTERPARTY" as const }
const date = "2026-11-10T10:00:00.000Z"
const account: ExactDebtAccount = { id: "00000000-0000-4000-8000-000000000001", partyType: party.partyType, externalCounterpartyId: party.id, workerId: null, direction: "PAYABLE", currency: "DZD", status: "OPEN", currentBalance: "90071992547409.93", settledAt: null, note: null, actorUserId: "operator", actorLabel: "Operator", transactionId: "txn", createdAt: date, updatedAt: date }
const entry: ExactDebtDetail["entries"][number] = { id: "00000000-0000-4000-8000-000000000002", debtAccountId: account.id, currency: "DZD", postingSequence: 1, entryType: "OPENING", signedAmountDzd: account.currentBalance, balanceAfterDzd: account.currentBalance, entryDate: date, note: "اتفاق المورد", reasonCategory: "OTHER", reasonDetail: "Agreement", paymentMethod: null, status: "LIVE", voidedAt: null, voidedBy: null, voidReason: null, invoiceId: null, producerType: null, producerId: null, targetEntryId: null, correctionOfEntryId: null, actorUserId: "operator", actorLabel: "Operator", transactionId: "txn", createdAt: date, updatedAt: date, remainingDzd: "0.30" }
const clients: QueryClient[] = []
function fixture() {
  const client = {
    summary: vi.fn().mockResolvedValue({ accounts: [account], grossPayableDzd: account.currentBalance, grossReceivableDzd: "0.00" }),
    detail: vi.fn().mockResolvedValue({ account, entries: [entry] }), create: vi.fn().mockResolvedValue(account),
    post: vi.fn().mockResolvedValue(entry), pay: vi.fn().mockResolvedValue(entry), correct: vi.fn().mockResolvedValue(entry), void: vi.fn().mockResolvedValue(entry), settle: vi.fn().mockResolvedValue([entry]),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(query)
  query.setQueryData(sessionQueryKey, { user: { id: "operator", name: "Operator", phone: "0612345678", version: "0.0.0" } })
  query.setQueryData(workspaceQueryKeys.workspaceSnapshot("operator"), { marker: "numeric-unchanged" })
  const view = render(<QueryClientProvider client={query}><ExactDebtsPage client={client as ExactDebtsClient} parties={[party]} /></QueryClientProvider>)
  return { client, query, unmount: view.unmount, remount: () => render(<QueryClientProvider client={query}><ExactDebtsPage client={client as ExactDebtsClient} parties={[party]} /></QueryClientProvider>), switchClient: (next: ExactDebtsClient) => view.rerender(<QueryClientProvider client={query}><ExactDebtsPage client={next} parties={[party]} /></QueryClientProvider>), switchScope: (next: ExactDebtPartyOption) => view.rerender(<QueryClientProvider client={query}><ExactDebtsPage client={client as ExactDebtsClient} parties={[next]} scopedParty={next} /></QueryClientProvider>) }
}
async function openAccount() {
  fireEvent.click(await screen.findByRole("button", { name: /المورد أحمد · مستحقات علينا/ }))
  await screen.findByRole("region", { name: "جدول حركات الدين" })
}
afterEach(() => { cleanup(); clients.splice(0).forEach(query => query.clear()); setMoneyGrouping(true) })
describe("injected exact debt page", () => {
  it("renders exact large cents and independent gross totals without touching numeric cache", async () => {
    const { query } = fixture()
    await openAccount()
    expect(screen.getAllByText("90,071,992,547,409.93").length).toBeGreaterThan(2)
    expect(screen.getByText("0.3")).toBeTruthy()
    expect(query.getQueryData(workspaceQueryKeys.workspaceSnapshot("operator"))).toEqual({ marker: "numeric-unchanged" })
  })
  it("filters accounts and computes scoped totals exactly for one party", async () => {
    const { client, query } = fixture()
    const otherAccount = { ...account, id: "other-account", workerId: "worker-1", externalCounterpartyId: null, partyType: "INTERNAL_WORKER" as const, currentBalance: "0.07" }
    client.summary.mockResolvedValue({ accounts: [account, otherAccount], grossPayableDzd: "90071992547410.00", grossReceivableDzd: "0.00" })
    const scoped = { id: party.id, label: party.label, partyType: party.partyType }
    render(<QueryClientProvider client={query}><ExactDebtsPage client={client as ExactDebtsClient} parties={[party]} scopedParty={scoped} /></QueryClientProvider>)
    expect((await screen.findAllByText("90,071,992,547,409.93")).length).toBeGreaterThan(0)
    expect(screen.queryByText(/علي بن حميد/)).toBeNull()
  })
  it.each(["00", "01"])("renders wide scoped totals with cents %s without mixing identical worker and external IDs", async cents => {
    const { client, query, unmount } = fixture()
    unmount()
    await query.cancelQueries()
    query.removeQueries({ predicate: row => row.queryKey.includes("debts-exact") })
    client.summary.mockResolvedValue({ accounts: [
      { ...account, currentBalance: "60000000000000000.00" },
      { ...account, id: "second", currentBalance: `60000000000000000.${cents}` },
      { ...account, id: "worker", partyType: "INTERNAL_WORKER", workerId: party.id, externalCounterpartyId: null, currentBalance: "50.00" },
    ], grossPayableDzd: "120000000000000050.01", grossReceivableDzd: "0.00" })
    render(<QueryClientProvider client={query}><ExactDebtsPage client={client as ExactDebtsClient} parties={[party]} scopedParty={party} /></QueryClientProvider>)
    expect(await screen.findByText(`120,000,000,000,000,000${cents === "00" ? "" : ".01"}`)).toBeTruthy()
    expect(screen.queryByText("50")).toBeNull()
  })
  it.each(["payment", "correction"])("cancels a manual %s child itself without original-only actions", async kind => {
    const { client } = fixture()
    const child = { ...entry, id: "manual-child", entryType: "PAYMENT" as const, targetEntryId: kind === "payment" ? entry.id : null, correctionOfEntryId: kind === "correction" ? entry.id : null, remainingDzd: "0.10" }
    client.detail.mockResolvedValue({ account, entries: [entry, child] })
    await openAccount()
    const row = document.querySelector('[data-entry-id="manual-child"]') as HTMLElement
    expect(within(row).queryByRole("button", { name: "تسجيل دفعة" })).toBeNull()
    expect(within(row).queryByRole("button", { name: "تصحيح المبلغ" })).toBeNull()
    fireEvent.click(within(row).getByRole("button", { name: "إلغاء الحركة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "السبب، مطلوب" }), { target: { value: "Wrong child" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.void).toHaveBeenCalledTimes(1))
    expect(client.void.mock.calls[0]?.[0]).toMatchObject({ entryId: child.id, voidReason: "Wrong child" })
    expect(client.pay).not.toHaveBeenCalled()
    expect(client.correct).not.toHaveBeenCalled()
  })
  it.each(["VOIDED", "producer"])("offers no entry actions for a %s child", async kind => {
    const { client } = fixture()
    client.detail.mockResolvedValue({ account, entries: [{ ...entry, targetEntryId: "original", status: kind === "VOIDED" ? "VOIDED" : "LIVE", producerType: kind === "producer" ? "PAYROLL_EARNINGS" : null }] })
    await openAccount()
    expect(within(screen.getByRole("region", { name: "جدول حركات الدين" })).queryAllByRole("button")).toHaveLength(0)
  })
  it("does not retain a selected ledger after switching the scoped party", async () => {
    const { switchScope } = fixture()
    await openAccount()
    switchScope({ id: "worker-1", label: "علي بن حميد", partyType: "INTERNAL_WORKER" })
    expect(screen.queryByRole("region", { name: "جدول حركات الدين" })).toBeNull()
    expect(screen.queryByText("اتفاق المورد")).toBeNull()
  })
  it("hides generic payment, correction, and void actions for producer-owned originals", async () => {
    const { client } = fixture()
    client.detail.mockResolvedValue({ account, entries: [{ ...entry, producerType: "PAYROLL_EARNINGS", producerId: "earning-1" }] })
    await openAccount()
    const ledger = screen.getByRole("region", { name: "جدول حركات الدين" })
    expect(within(ledger).queryByRole("button", { name: "تسجيل دفعة" })).toBeNull()
    expect(within(ledger).queryByRole("button", { name: "تصحيح المبلغ" })).toBeNull()
    expect(within(ledger).queryByRole("button", { name: "إلغاء الحركة" })).toBeNull()
    expect((screen.getByRole("button", { name: "تسوية الحساب بالكامل" }) as HTMLButtonElement).disabled).toBe(true)
  })
  it("submits localized payment as canonical text, with per-obligation maximum and first-click full amount", async () => {
    const { client } = fixture()
    await openAccount()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" })
    fireEvent.change(input, { target: { value: "٠٫٣١" } })
    expect((within(dialog).getByRole("button", { name: "تأكيد الحفظ" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole("button", { name: "كامل المبلغ" }))
    expect((input as HTMLInputElement).value).toBe("0.30")
    fireEvent.change(input, { target: { value: "٠٫١٠" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(1))
    expect(client.pay.mock.calls[0]?.[0]).toMatchObject({ debtEntryId: entry.id, amountDzd: "0.10", paymentMethod: "CASH", requestId: expect.any(String) })
  })
  it("keeps the same request key after uncertain transport failure and retry", async () => {
    const { client } = fixture()
    client.pay.mockRejectedValueOnce(new Error("Network timed out"))
    await openAccount()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "0.10" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await screen.findByRole("alert")
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(2))
    expect(client.pay.mock.calls[0]?.[0]).toEqual(client.pay.mock.calls[1]?.[0])
  })
  it("reuses a committed payment receipt after a lost response and page remount", async () => {
    const { client, unmount, remount } = fixture()
    const receipts = new Set<string>()
    let committedPayments = 0
    let loseResponse = true
    client.pay.mockImplementation(async (input: { requestId: string }) => {
      if (!receipts.has(input.requestId)) { receipts.add(input.requestId); committedPayments++ }
      if (loseResponse) { loseResponse = false; throw new Error("Response lost after commit") }
      return entry
    })
    await openAccount()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    let dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "0.10" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await screen.findByRole("alert")
    expect(committedPayments).toBe(1)
    unmount()
    remount()
    await openAccount()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "0.10" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(2))
    expect(client.pay.mock.calls[1]?.[0]).toEqual(client.pay.mock.calls[0]?.[0])
    expect(committedPayments).toBe(1)
  })
  it("does not reuse an uncertain command receipt key across injected clients", async () => {
    const { client, switchClient } = fixture()
    client.pay.mockRejectedValueOnce(new Error("Network timed out"))
    await openAccount()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "0.10" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await screen.findByRole("alert")
    const nextClient = { ...client, pay: vi.fn().mockResolvedValue(entry) }
    switchClient(nextClient as ExactDebtsClient)
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(nextClient.pay).toHaveBeenCalledTimes(1))
    expect(nextClient.pay.mock.calls[0]?.[0].requestId).not.toBe(client.pay.mock.calls[0]?.[0].requestId)
  })
  it("sends explicit correction, void reason, signed adjustment and attributed settlement commands", async () => {
    const { client } = fixture()
    await openAccount()
    for (const [button, method, value] of [["تصحيح المبلغ", "correct", "90071992547409.92"], ["إلغاء الحركة", "void", null], ["إضافة حركة", "post", "-0.01"], ["تسوية الحساب بالكامل", "settle", null]] as const) {
      fireEvent.click(screen.getByRole("button", { name: button }))
      const dialog = await screen.findByRole("dialog")
      if (value) fireEvent.change(within(dialog).getByRole("textbox", { name: /المبلغ المتفق عليه|مبلغ الحركة/ }), { target: { value } })
      const reason = within(dialog).getByRole("textbox", { name: method === "settle" ? "ملاحظة، اختيارية" : "السبب، مطلوب" })
      fireEvent.change(reason, { target: { value: "تصحيح موثق" } })
      fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
      await waitFor(() => expect(client[method]).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    }
    expect(client.correct.mock.calls[0]?.[0]).toMatchObject({ entryId: entry.id, amountDzd: "90071992547409.92", reason: "تصحيح موثق" })
    expect(client.void.mock.calls[0]?.[0]).toMatchObject({ entryId: entry.id, voidReason: "تصحيح موثق" })
    expect(client.post.mock.calls[0]?.[0]).toMatchObject({ signedAmountDzd: "-0.01", debtAccountId: account.id })
    expect(client.settle.mock.calls[0]?.[0]).toMatchObject({ debtAccountId: account.id })
  })
  it("keeps omitted opening distinct from explicit zero and sends the selected direction", async () => {
    const { client } = fixture()
    fireEvent.change(screen.getByRole("textbox", { name: "سبب الدين" }), { target: { value: "حساب دون افتتاح" } })
    fireEvent.change(screen.getByRole("combobox", { name: "اتجاه الحساب" }), { target: { value: "RECEIVABLE" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ الحساب" }))
    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1))
    expect(client.create.mock.calls[0]?.[0]).not.toHaveProperty("openingBalanceDzd")
    expect(client.create.mock.calls[0]?.[0]).toMatchObject({ direction: "RECEIVABLE", externalCounterpartyId: party.id })
    await act(async () => {})
  })
})
