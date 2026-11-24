// @vitest-environment jsdom
import { i18n } from "@/i18n"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactDebtAccount, ExactDebtDetail, ExactDebtsClient } from "@tuari/contracts"
import { sessionQueryKey, workspaceQueryKeys } from "@/features/app-shell/workspace-keys"
import { setMoneyGrouping } from "@/features/preferences/money-format-preference"
import { ExactDebtsPage, type ExactDebtPartyOption } from "./debts-exact-page"
vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "operator" } } }) }))
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock("@/features/employees/employee-earnings-queries", () => ({ useEmployeePayrollQuery: () => ({ isPending: true }) }))
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
  it("preserves account and creation drafts across tabs", async () => {
    const { client } = fixture()
    await openAccount()
    const ledgerTab = screen.getByRole("tab", { name: "القيود والمدفوعات" })
    expect(ledgerTab.getAttribute("aria-selected")).toBe("true")
    act(() => { ledgerTab.focus() })
    fireEvent.keyDown(ledgerTab, { key: "ArrowLeft" })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: "اختيار أو إنشاء حساب" })))
    fireEvent.click(screen.getByRole("tab", { name: "اختيار أو إنشاء حساب" }))
    fireEvent.change(screen.getByRole("textbox", { name: "سبب الدين" }), { target: { value: "draft" } })
    fireEvent.click(screen.getByRole("tab", { name: "التسوية وسجلها" }))
    expect(screen.getByText("لا توجد تسويات مسجلة لهذا الحساب.")).toBeTruthy()
    fireEvent.click(screen.getByRole("tab", { name: "اختيار أو إنشاء حساب" }))
    expect((screen.getByRole("textbox", { name: "سبب الدين" }) as HTMLTextAreaElement).value).toBe("draft")
    fireEvent.click(screen.getByRole("tab", { name: "القيود والمدفوعات" }))
    expect(screen.getByRole("region", { name: "جدول حركات الدين" })).toBeTruthy()
    expect(client.detail.mock.calls.every(([input]) => input.id === account.id)).toBe(true)
  })

  it("reaches all 61 accounts and entries, targets a later-page payment and clamps after shrink", async () => {
    const { client, query } = fixture()
    await screen.findByRole("button", { name: /المورد أحمد · مستحقات علينا/ })
    const accounts = Array.from({ length: 61 }, (_, i) => ({ ...account, id: `account-${i}`, currentBalance: `${i + 1}.00` }))
    const entries = Array.from({ length: 61 }, (_, i) => ({ ...entry, id: `entry-${i}`, postingSequence: i + 1 }))
    client.summary.mockResolvedValue({ accounts, grossPayableDzd: "1891.00", grossReceivableDzd: "0.00" })
    client.detail.mockImplementation(async (input: { id: string }) => ({ account: accounts.find(row => row.id === input.id), entries }))
    await act(async () => { await query.invalidateQueries() })
    const seenAccounts = new Set<string>()
    const accountNav = screen.getByRole("navigation", { name: "حسابات الديون" })
    const accountPages = screen.getByRole("navigation", { name: "صفحات الحسابات" })
    await waitFor(() => expect(within(accountNav).getAllByRole("button")).toHaveLength(15))
    for (let page = 0; page < 5; page++) {
      for (const button of within(accountNav).getAllByRole("button")) seenAccounts.add(button.textContent!)
      if (page < 4) fireEvent.click(within(accountPages).getByRole("button", { name: "التالي" }))
    }
    expect(seenAccounts.size).toBe(61)
    fireEvent.click(within(accountNav).getByRole("button"))
    await screen.findByRole("region", { name: "جدول حركات الدين" })
    const seenEntries = new Set<string>()
    const entryPages = screen.getByRole("navigation", { name: "صفحات الحركات" })
    for (let page = 0; page < 7; page++) {
      document.querySelectorAll("[data-entry-id]").forEach(row => seenEntries.add(row.getAttribute("data-entry-id")!))
      if (page < 6) fireEvent.click(within(entryPages).getByRole("button", { name: "التالي" }))
    }
    expect(seenEntries.size).toBe(61)
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }), { target: { value: "0.10" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(1))
    expect(client.pay.mock.calls[0]?.[0]).toMatchObject({ debtEntryId: "entry-0", amountDzd: "0.10" })
    client.summary.mockResolvedValue({ accounts: [accounts[60]], grossPayableDzd: "61.00", grossReceivableDzd: "0.00" })
    client.detail.mockResolvedValue({ account: accounts[60], entries: [entries[0]] })
    await act(async () => { await query.invalidateQueries() })
    expect(within(accountNav).getAllByRole("button")).toHaveLength(1)
    expect(document.querySelectorAll("[data-entry-id]")).toHaveLength(1)
    await waitFor(() => expect((within(screen.getByRole("navigation", { name: "صفحات الحركات" })).getByRole("button", { name: "السابق" }) as HTMLButtonElement).disabled).toBe(true))
    fireEvent.change(screen.getByRole("textbox", { name: "بحث عن حساب" }), { target: { value: "missing" } })
    expect(within(accountNav).queryAllByRole("button", { name: /المورد أحمد/ })).toHaveLength(0)
    fireEvent.change(screen.getByRole("textbox", { name: "بحث عن حساب" }), { target: { value: "أحمد" } })
    expect(within(accountNav).getAllByRole("button")).toHaveLength(1)
    client.detail.mockResolvedValue({ account: accounts[60], entries })
    await act(async () => { await query.invalidateQueries() })
    await waitFor(() => expect(document.querySelectorAll("[data-entry-id]")).toHaveLength(10))
  })
  it("resolves active page, ledger and dialog copy from Arabic resources", async () => {
    const replacements = {
      title: "عنوان مترجم للاختبار",
      createTitle: "نموذج مترجم للاختبار",
      entriesTable: "جدول مترجم للاختبار",
      opening: "افتتاح مترجم للاختبار",
      pay: "دفع مترجم للاختبار",
      actionHelp: "وصف مترجم للاختبار",
      confirm: "تأكيد مترجم للاختبار",
    }
    const originals = Object.entries(replacements).map(([name, value]) => {
      const key = `exactDebts.${name}`
      return { key, value, original: i18n.getResource("ar", "translation", key) }
    })
    try {
      for (const { key, value } of originals) i18n.addResource("ar", "translation", key, value)
      fixture()
      expect(screen.getByRole("heading", { name: replacements.title })).toBeTruthy()
      fireEvent.click(screen.getByRole("tab", { name: "اختيار أو إنشاء حساب" }))
      expect(screen.getByRole("heading", { name: replacements.createTitle })).toBeTruthy()
      fireEvent.click(screen.getByRole("tab", { name: "القيود والمدفوعات" }))
      fireEvent.click(await screen.findByRole("button", { name: /المورد أحمد · مستحقات علينا/ }))
      const ledger = await screen.findByRole("region", { name: replacements.entriesTable })
      expect(within(ledger).getByText(replacements.opening)).toBeTruthy()
      fireEvent.click(within(ledger).getByRole("button", { name: replacements.pay }))
      const dialog = await screen.findByRole("dialog", { name: replacements.pay })
      expect(within(dialog).getByText(replacements.actionHelp)).toBeTruthy()
      expect(within(dialog).getByRole("button", { name: replacements.confirm })).toBeTruthy()
    } finally {
      cleanup()
      for (const { key, original } of originals) i18n.addResource("ar", "translation", key, original)
    }
  })

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
    fireEvent.click(screen.getByRole("tab", { name: "التسوية وسجلها" }))
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
    expect(within(dialog).queryByRole("region", { name: "معاينة الدفعة" })).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "كامل المبلغ" }))
    expect((input as HTMLInputElement).value).toBe("0.30")
    fireEvent.change(input, { target: { value: "٠٫١٠" } })
    expect(within(dialog).getByRole("region", { name: "معاينة الدفعة" }).textContent).toContain("0.1")
    expect(within(dialog).getByRole("region", { name: "معاينة الدفعة" }).textContent).toContain("0.2")
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(1))
    expect(client.pay.mock.calls[0]?.[0]).toMatchObject({ debtEntryId: entry.id, amountDzd: "0.10", paymentMethod: "CASH", requestId: expect.any(String) })
  })
  it.each(["PAYABLE", "RECEIVABLE"] as const)("previews the selected original and submits retained localized text in %s accounts", async direction => {
    const { client, query, unmount, remount } = fixture()
    await screen.findByRole("button", { name: /المورد أحمد · مستحقات علينا/ })
    const selectedAccount = { ...account, direction }
    const original = { ...entry, remainingDzd: "2500.00" }
    const unrelated = { ...entry, id: "unrelated", remainingDzd: "75.00", postingSequence: 2 }
    client.summary.mockResolvedValue({ accounts: [selectedAccount], grossPayableDzd: direction === "PAYABLE" ? account.currentBalance : "0.00", grossReceivableDzd: direction === "RECEIVABLE" ? account.currentBalance : "0.00" })
    client.detail.mockResolvedValue({ account: selectedAccount, entries: [original, unrelated] })
    await act(async () => { await query.invalidateQueries() })
    fireEvent.click(await screen.findByRole("button", { name: direction === "PAYABLE" ? /المورد أحمد · مستحقات علينا/ : /المورد أحمد · مستحقات لنا/ }))
    await screen.findByRole("region", { name: "جدول حركات الدين" })
    expect(screen.getByRole("heading", { name: direction === "PAYABLE" ? "حركات الحساب · مستحقات علينا" : "حركات الحساب · مستحقات لنا" })).toBeTruthy()
    fireEvent.click(within(document.querySelector(`[data-entry-id="${entry.id}"]`) as HTMLElement).getByRole("button", { name: "تسجيل دفعة" }))
    let dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }) as HTMLInputElement
    fireEvent.change(input, { target: { value: "2 000.50" } })
    expect(input.value).toBe("2 000.50")
    const preview = within(dialog).getByRole("region", { name: "معاينة الدفعة" })
    expect(within(preview).getByText("2,000.5").closest("p")?.textContent).toContain("مبلغ الدفعة")
    expect(within(preview).getByText("499.5").closest("p")?.textContent).toContain("الرصيد بعد الدفعة")
    expect(within(preview).queryByRole("textbox")).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(1))
    expect(client.pay.mock.calls[0]?.[0]).toMatchObject({ debtEntryId: entry.id, amountDzd: "2000.50", paymentMethod: "CASH" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    // A server reload, not the preview, owns the new remaining amount.
    client.detail.mockResolvedValue({ account: selectedAccount, entries: [{ ...original, remainingDzd: "499.50" }, unrelated] })
    unmount()
    remount()
    fireEvent.click(await screen.findByRole("button", { name: direction === "PAYABLE" ? /المورد أحمد · مستحقات علينا/ : /المورد أحمد · مستحقات لنا/ }))
    await screen.findByText("499.5")
    fireEvent.click(within(document.querySelector('[data-entry-id="unrelated"]') as HTMLElement).getByRole("button", { name: "تسجيل دفعة" }))
    dialog = await screen.findByRole("dialog")
    expect((within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }) as HTMLInputElement).value).toBe("")
    expect(within(dialog).queryByRole("region", { name: "معاينة الدفعة" })).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "كامل المبلغ" }))
    expect(within(within(dialog).getByRole("region", { name: "معاينة الدفعة" })).getByText("75")).toBeTruthy()
    expect(within(within(dialog).getByRole("region", { name: "معاينة الدفعة" })).getByText("0")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(2))
    expect(client.pay.mock.calls[1]?.[0]).toMatchObject({ debtEntryId: "unrelated", amountDzd: "75.00" })
  })
  it.each([
    ["", false], [" ", false], ["-", true], [".", true], ["20 00.50", true], ["2,000 000.50", true],
    ["0", false], ["-0.01", false], ["2500.01", true], ["1.001", true], ["92233720368547758.08", true], ["0".repeat(129), true],
  ] as const)("never projects or writes invalid payment draft %j", async (draft, ariaInvalid) => {
    const { client } = fixture()
    client.detail.mockResolvedValue({ account, entries: [{ ...entry, remainingDzd: "2500.00" }] })
    await openAccount()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }) as HTMLInputElement
    fireEvent.change(input, { target: { value: draft } })
    fireEvent.blur(input)
    expect(input.value).toBe(draft)
    if (ariaInvalid) expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(within(dialog).queryByRole("region", { name: "معاينة الدفعة" })).toBeNull()
    expect((within(dialog).getByRole("button", { name: "تأكيد الحفظ" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(input.closest("form")!)
    await act(async () => {})
    expect(client.pay).not.toHaveBeenCalled()
  })
  it.each([
    ["0".repeat(127) + "1", "1.00", "1", "92,233,720,368,547,757.07"],
    ["٠٫٠١", "0.01", "0.01", "92,233,720,368,547,758.06"],
    ["92 233 720 368 547 758.06", "92233720368547758.06", "92,233,720,368,547,758.06", "0.01"],
    ["92233720368547758.07", "92233720368547758.07", "92,233,720,368,547,758.07", "0"],
  ])("preserves large original cents for %s beneath a wide account total", async (draft, canonical, paid, remaining) => {
    const { client, query } = fixture()
    await screen.findByRole("button", { name: /المورد أحمد · مستحقات علينا/ })
    client.summary.mockResolvedValue({ accounts: [account, { ...account, id: "second", externalCounterpartyId: "other", currentBalance: "92233720368547758.07" }], grossPayableDzd: "92323792361095168.00", grossReceivableDzd: "0.00" })
    client.detail.mockResolvedValue({ account, entries: [{ ...entry, remainingDzd: "92233720368547758.07" }] })
    await act(async () => { await query.invalidateQueries() })
    expect(await screen.findByText("92,323,792,361,095,168")).toBeTruthy()
    await openAccount()
    fireEvent.click(screen.getByRole("button", { name: "تسجيل دفعة" }))
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByRole("textbox", { name: "مبلغ الدفعة" }) as HTMLInputElement
    fireEvent.change(input, { target: { value: draft } })
    expect(input.value).toBe(draft)
    const preview = within(dialog).getByRole("region", { name: "معاينة الدفعة" })
    expect(within(preview).getByText(paid)).toBeTruthy()
    expect(within(preview).getByText(remaining)).toBeTruthy()
    if (canonical === "92233720368547758.07") {
      fireEvent.click(within(dialog).getByRole("button", { name: "كامل المبلغ" }))
      expect(input.value).toBe("92233720368547758.07")
      expect(within(preview).getByText("0")).toBeTruthy()
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد الحفظ" }))
    await waitFor(() => expect(client.pay).toHaveBeenCalledTimes(1))
    expect(client.pay.mock.calls[0]?.[0]).toMatchObject({ debtEntryId: entry.id, amountDzd: canonical })
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
      if (method === "settle") fireEvent.click(screen.getByRole("tab", { name: "التسوية وسجلها" }))
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
    fireEvent.click(screen.getByRole("tab", { name: "اختيار أو إنشاء حساب" }))
    fireEvent.change(screen.getByRole("textbox", { name: "سبب الدين" }), { target: { value: "حساب دون افتتاح" } })
    fireEvent.change(screen.getByRole("combobox", { name: "اتجاه الحساب" }), { target: { value: "RECEIVABLE" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ الحساب" }))
    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1))
    expect(client.create.mock.calls[0]?.[0]).not.toHaveProperty("openingBalanceDzd")
    expect(client.create.mock.calls[0]?.[0]).toMatchObject({ direction: "RECEIVABLE", externalCounterpartyId: party.id })
    await act(async () => {})
  })
})
