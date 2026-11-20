// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExactDebtAccount, ExactDebtsClient, ExternalCounterparty } from "@tuari/contracts"
import type { ExactDebtSummary } from "@/features/debts/debts-queries"

const mocks = vi.hoisted(() => ({ useExactDebtSummary: vi.fn() }))
vi.mock("@/features/debts/debts-exact-queries", () => ({ useExactDebtSummary: mocks.useExactDebtSummary }))

import { ExternalCounterpartiesRoute } from "./external-counterparties-route"

afterEach(() => { cleanup(); vi.clearAllMocks() })

const counterparties: ExternalCounterparty[] = [
  { id: "external-1", fullName: "شركة المورد", phoneNumber: "0555000000", note: "ملاحظة", createdAt: "2026-03-27T10:00:00.000Z", updatedAt: "2026-03-27T10:00:00.000Z" },
  { id: "external-2", fullName: "مورد بلا رصيد", phoneNumber: "0555111111", note: null, createdAt: "2026-03-27T10:00:00.000Z", updatedAt: "2026-03-27T10:00:00.000Z" },
]
function account(overrides: Partial<ExactDebtAccount>): ExactDebtAccount {
  return {
    id: "debt-1", partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: "external-1", workerId: null,
    direction: "RECEIVABLE", currency: "DZD", status: "OPEN", currentBalance: "90071992547409.93", settledAt: null,
    note: null, actorUserId: "operator", actorLabel: "Operator", transactionId: "txn",
    createdAt: "2026-03-27T10:00:00.000Z", updatedAt: "2026-03-27T10:00:00.000Z", ...overrides,
  }
}
function summary(accounts: ExactDebtAccount[]): ExactDebtSummary {
  return { accounts, grossPayableDzd: "0.00", grossReceivableDzd: "0.00" }
}
function renderRoute(client: ExactDebtsClient) {
  const onCreate = vi.fn()
  const onOpen = vi.fn()
  render(<ExternalCounterpartiesRoute client={client} counterparties={counterparties} onCreate={onCreate} onOpen={onOpen} />)
  return { onCreate, onOpen }
}

describe("ExternalCounterpartiesRoute", () => {
  it("uses the exact debt summary and displays literal balances while preserving metadata and file links", () => {
    const client = { summary: vi.fn() } as unknown as ExactDebtsClient
    mocks.useExactDebtSummary.mockReturnValue({
      data: summary([
        account({}),
        account({ id: "debt-2", direction: "PAYABLE", currentBalance: "-0.01", status: "SETTLED" }),
        account({ id: "wrong-type", partyType: "INTERNAL_WORKER", workerId: "external-1", externalCounterpartyId: null, currentBalance: "1000000000000000.00" }),
        account({ id: "wrong-id", externalCounterpartyId: "external-3", currentBalance: "1000000000000000.00" }),
      ]),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
    const { onOpen } = renderRoute(client)

    expect(mocks.useExactDebtSummary).toHaveBeenCalledWith(client)
    expect(screen.getByText("شركة المورد")).toBeTruthy()
    expect(screen.getByText("0555000000")).toBeTruthy()
    expect(screen.getAllByText("90,071,992,547,409.92").length).toBeGreaterThan(0)
    expect(screen.getByText("مورد بلا رصيد")).toBeTruthy()
    expect(screen.getByText("مسوّى")).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "فتح الملف" })[0]!)
    expect(onOpen).toHaveBeenCalledWith("external-1")
  })

  it("shows loading feedback until the exact summary resolves", () => {
    mocks.useExactDebtSummary.mockReturnValue({ isPending: true, isError: false, refetch: vi.fn() })
    renderRoute({} as ExactDebtsClient)
    expect(screen.getByRole("status").textContent).toContain("جار تحميل الأطراف")
  })

  it("shows a retry action when the exact summary fails", () => {
    const refetch = vi.fn()
    mocks.useExactDebtSummary.mockReturnValue({ isPending: false, isError: true, refetch })
    renderRoute({} as ExactDebtsClient)
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert")).toBeTruthy()
  })
})
