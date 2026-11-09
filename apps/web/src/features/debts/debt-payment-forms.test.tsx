// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DebtAccount } from "@tuari/contracts"
import type { ReactNode } from "react"
import { DebtLedgerPanel } from "./debt-ledger-panel"
import { RecordPaymentDialog } from "./record-payment-dialog"
import { DebtCasesPanel } from "./debt-cases-panel"

const { createEntry, showErrorToast } = vi.hoisted(() => ({ createEntry: vi.fn(), showErrorToast: vi.fn() }))
vi.mock("@/lib/orpc-client", async () => ({
  ...await vi.importActual<typeof import("@/lib/orpc-client")>("@/lib/orpc-client"),
  rpcClient: { debtEntriesCreate: createEntry },
}))
vi.mock("@/lib/toast", () => ({ showErrorToast, showSuccessToast: vi.fn() }))

const account: DebtAccount = {
  id: "receivable", direction: "RECEIVABLE", currentBalance: 22500.5, partyType: "EXTERNAL_COUNTERPARTY",
  externalCounterpartyId: "external-1", workerId: null, status: "OPEN", note: null, settledAt: null,
  actorUserId: null, actorLabel: null, transactionId: null,
  createdAt: "2026-03-27T10:00:00.000Z", updatedAt: "2026-03-27T10:00:00.000Z",
}
function renderForm(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe("debt payment form to RPC", () => {
  it.each(["ledger", "dialog"])("%s previews a grouped decimal and submits PAYMENT with the same amount", async (form) => {
    createEntry.mockResolvedValue({ success: true, message: "ok", item: { id: "payment-1" } })
    if (form === "ledger") {
      renderForm(<DebtLedgerPanel debtAccount={account} debtEntries={[]} title="الحساب" />)
    } else {
      renderForm(<RecordPaymentDialog debtAccount={account} open onOpenChange={vi.fn()} />)
    }
    fireEvent.change(screen.getByRole("textbox", { name: /مبلغ الدفعة|المبلغ الموقّع/ }), { target: { value: "2 500.50" } })
    const preview = screen.getByLabelText("معاينة الدفعة")
    expect(preview.textContent).toContain("2,500.5")
    expect(preview.textContent).toContain("20,000")
    fireEvent.click(screen.getByRole("button", { name: form === "ledger" ? "تسجيل دفعة" : "تأكيد الدفعة" }))
    await waitFor(() => expect(createEntry).toHaveBeenCalledWith(expect.objectContaining({
      debtAccountId: "receivable", entryType: "PAYMENT", signedAmountDzd: -2500.5,
    })))
  })

  it("previews Arabic-Indic input in the cases form and submits to the sole receivable ledger", async () => {
    createEntry.mockResolvedValue({ success: true, message: "ok", item: { id: "payment-1" } })
    renderForm(<DebtCasesPanel accounts={[account]} debtEntriesByAccountId={{}} title="طرف" externalCounterpartyId="external-1" />)
    fireEvent.change(screen.getByPlaceholderText("0 أو 2500"), { target: { value: "٢٬٥٠٠٫٥٠" } })
    expect(screen.getByLabelText("معاينة الدفعة").textContent).toContain("20,000")
    fireEvent.click(screen.getAllByRole("button", { name: "تسجيل دفعة" })[0]!)
    await waitFor(() => expect(createEntry).toHaveBeenCalledWith(expect.objectContaining({ debtAccountId: "receivable", entryType: "PAYMENT", signedAmountDzd: -2500.5 })))
  })

  it("defaults to a sole receivable account and shows the selected ledger's balance", () => {
    renderForm(<DebtCasesPanel accounts={[account]} debtEntriesByAccountId={{}} title="طرف" externalCounterpartyId="external-1" />)
    expect(screen.getByText("تسجيل دفعة على الحساب")).toBeTruthy()
    expect(screen.getAllByText("الرصيد الحالي — مستحقات لنا")).toHaveLength(2)
  })

  it("changes the stat card to the selected ledger rather than the newest account or net", () => {
    renderForm(<DebtCasesPanel accounts={[{ ...account, id: "payable", direction: "PAYABLE", currentBalance: 1000 }, account]} debtEntriesByAccountId={{}} title="طرف" externalCounterpartyId="external-1" />)
    const payableLabels = screen.getAllByText("الرصيد الحالي — مستحقات علينا")
    expect(payableLabels).toHaveLength(2)
    const selectedCard = payableLabels[0]!.closest("section")!
    expect(within(selectedCard).getByText("دج 1,000")).toBeTruthy()
    expect(within(selectedCard).queryByText("دج 22,500.5")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "مستحقات لنا" }))
    expect(screen.getAllByText("الرصيد الحالي — مستحقات لنا")).toHaveLength(2)
    expect(within(selectedCard).getByText("دج 22,500.5")).toBeTruthy()
    expect(within(selectedCard).queryByText("دج 1,000")).toBeNull()
  })

  it.each(["transport", "domain"])("keeps a %s-rejected draft, shows the mutation onError toast and never closes the dialog", async (failure) => {
    if (failure === "transport") createEntry.mockRejectedValue(new Error("تعذر تسجيل الدفعة"))
    else createEntry.mockResolvedValue({ success: false, error: { message: "تعذر تسجيل الدفعة", code: "VALIDATION" } })
    const onOpenChange = vi.fn()
    renderForm(<RecordPaymentDialog debtAccount={account} open onOpenChange={onOpenChange} />)
    const amount = screen.getByRole("textbox", { name: /مبلغ الدفعة/ }) as HTMLInputElement
    fireEvent.change(amount, { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الدفعة" }))
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith("تعذر تسجيل الدفعة"))
    expect(amount.value).toBe("500")
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it.each(["25 00.50", "1,50", "abc"])("blocks malformed ledger amount %s with a visible reason and no RPC", (value) => {
    renderForm(<DebtLedgerPanel debtAccount={account} debtEntries={[]} title="الحساب" />)
    fireEvent.change(screen.getByRole("textbox", { name: /مبلغ الدفعة|المبلغ الموقّع/ }), { target: { value } })
    expect((screen.getByRole("button", { name: "تسجيل دفعة" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/أدخل مبلغًا رقميًا صالحًا/)).toBeTruthy()
    expect(createEntry).not.toHaveBeenCalled()
  })
})
