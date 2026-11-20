// @vitest-environment jsdom
import "@/i18n"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { format } from "date-fns"
import { exactReportSchema } from "@tuari/contracts"
import { ReportBuilder } from "./report-builder"
import { formatReportAsCSV } from "@/hooks/use-report-queries"
import { MIDNIGHT_CROSSING, pinUtcTimeZone } from "@/test-utils/algeria-day"

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }))
// Only the published financial leaf exists: a legacy leaf cannot satisfy these tests.
vi.mock("@/lib/orpc-client", () => ({ financialClient: { reports: { generate } } }))

const inventory = exactReportSchema.parse({
  type: "INVENTORY", generatedAt: MIDNIGHT_CROSSING,
  summary: { totalAssetsDzd: "12345678901234567890.01", totalConsumablesDzd: "0.00", totalValueDzd: "12345678901234567890.02" },
  byLocation: [{ locationId: null, locationType: null, locationLabel: "Purchase warehouse", assetCount: 2, assetValueDzd: "12345678901234567890.01", consumableCount: 3 }],
  byItemType: [], agingAnalysis: [],
})
const debt = exactReportSchema.parse({
  type: "DEBT", generatedAt: MIDNIGHT_CROSSING,
  summary: { totalOutstandingDzd: "1.01", totalSettledDzd: "0.00", overdueDzd: "-0.01", partyCount: 2 },
  agingBreakdown: [], byParty: [], topDebtors: [{ partyName: "Debtor", amountDzd: "12345678901234567890.02", daysSinceLastPayment: 4 }],
})
const movement = exactReportSchema.parse({
  type: "MOVEMENT", generatedAt: MIDNIGHT_CROSSING,
  outboundDocuments: [{ transferType: "SALE", count: 2 }, { transferType: "RETURN", count: 1 }, { transferType: "GIFT", count: 3 }],
  summary: { totalMovements: 9, assetTransfers: 1, consumableTransfers: 2, outboundSales: 6 },
  byType: [{ movementType: "OUTBOUND_SALE", count: 6, valueDzd: "0.01" }], byPeriod: [], topDestinations: [],
})
const clients: QueryClient[] = []
function renderPage() {
  // The hook explicitly retries once. Remove only the delay, not that behavior.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><ReportBuilder /></QueryClientProvider>)
}
function generateReport() { fireEvent.click(screen.getByRole("button", { name: "إنشاء التقرير" })) }
function pickDay(index: number, day: string) {
  const trigger = document.querySelectorAll<HTMLElement>('[data-slot="popover-trigger"]')[index]
  expect(trigger).toBeTruthy()
  fireEvent.click(trigger!)
  const cell = document.querySelector(`[data-day="${day}"]`)
  expect(cell).not.toBeNull()
  fireEvent.click(cell!.querySelector("button") ?? cell!)
}
afterEach(() => {
  cleanup()
  clients.splice(0).forEach(client => client.clear())
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe("exact report consumers", () => {
  it("does not fetch or offer a download until generation is enabled", async () => {
    generate.mockResolvedValue(inventory)
    renderPage()
    expect(generate).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "تحميل CSV" })).toBeNull()
    generateReport()
    await screen.findByText("12345678901234567890.01", { selector: 'bdi[dir="ltr"]' })
    expect(generate).toHaveBeenCalledExactlyOnceWith({ type: "INVENTORY", startDate: undefined, endDate: undefined })
  })

  it("sends inclusive picker bounds as offset-bearing Algeria instants", async () => {
    generate.mockResolvedValue(inventory)
    const month = format(new Date(), "yyyy-MM")
    renderPage()
    pickDay(0, `${month}-10`)
    pickDay(1, `${month}-15`)
    generateReport()
    await waitFor(() => expect(generate).toHaveBeenCalledExactlyOnceWith({
      type: "INVENTORY", startDate: `${month}-09T23:00:00.000Z`, endDate: `${month}-15T22:59:59.999Z`,
    }))
  }, 15000)

  it("keeps wide one-cent differences, zero and RTL currency isolation in UI and CSV", async () => {
    generate.mockResolvedValue(inventory)
    const { container } = renderPage()
    generateReport()
    await screen.findByText("12345678901234567890.01", { selector: "bdi" })
    const amounts = [...container.querySelectorAll('span[dir="ltr"] > span[dir="rtl"] + bdi[dir="ltr"]')]
    expect(amounts.map(el => el.textContent)).toEqual(["12345678901234567890.01", "0", "12345678901234567890.02"])
    expect(amounts.every(el => el.previousElementSibling?.textContent === "د.ج")).toBe(true)
    const csv = formatReportAsCSV(inventory)
    expect(csv).toContain("Total Assets (DZD),12345678901234567890.01")
    expect(csv).toContain("Total Consumables (DZD),0.00")
    expect(csv).toContain("Total Value (DZD),12345678901234567890.02")
    expect(csv).toContain('"Purchase warehouse",2,12345678901234567890.01,3')
    expect(csv).toContain("not current stock")
  })

  it("selects DEBT on the financial leaf, retains signed amounts and avoids a false debt direction", async () => {
    generate.mockResolvedValue(debt)
    renderPage()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "DEBT" } })
    generateReport()
    await screen.findByText("-0.01", { selector: "bdi" })
    expect(generate).toHaveBeenCalledExactlyOnceWith({ type: "DEBT", startDate: undefined, endDate: undefined })
    expect(screen.queryByText("مستحق لنا")).toBeNull()
    expect(screen.getByText("مسوّى")).toBeTruthy()
    expect(screen.getByText("1.01", { selector: "bdi" })).toBeTruthy()
    const csv = formatReportAsCSV(debt)
    expect(csv).toContain("Overdue (DZD),-0.01")
    expect(csv).toContain("Total Settled (DZD),0.00")
    expect(csv).toContain('"Debtor",12345678901234567890.02,4')
  })

  it("selects MOVEMENT and separates mixed raw outbound counts from document counts", async () => {
    generate.mockResolvedValue(movement)
    renderPage()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MOVEMENT" } })
    generateReport()
    const documents = await screen.findByRole("region", { name: "مستندات الصادر حسب النوع" })
    expect(generate).toHaveBeenCalledExactlyOnceWith({ type: "MOVEMENT", startDate: undefined, endDate: undefined })
    expect(screen.getByText(/OUTBOUND_SALE.*يشمل البيع والإرجاع والهدايا/)).toBeTruthy()
    expect(within(documents).getByText("SALE").closest("div")?.textContent).toBe("SALE2")
    expect(within(documents).getByText("RETURN").closest("div")?.textContent).toBe("RETURN1")
    expect(within(documents).getByText("GIFT").closest("div")?.textContent).toBe("GIFT3")
    const csv = formatReportAsCSV(movement)
    expect(csv).toContain("Raw outbound movement-kind count (OUTBOUND_SALE; sale/return/gift),6")
    expect(csv).toContain("SALE,2\nRETURN,1\nGIFT,3")
    expect(csv).not.toContain("Outbound Sales")
  })

  it("renders and exports generatedAt in Algeria under a UTC machine for every variant", async () => {
    const restore = pinUtcTimeZone()
    try {
      generate.mockResolvedValue(inventory)
      renderPage()
      generateReport()
      await screen.findByText("01/10/2026")
      expect(screen.getByText("12:00:00 ص")).toBeTruthy()
      expect(screen.queryByText("30/09/2026")).toBeNull()
      for (const report of [inventory, debt, movement]) {
        expect(formatReportAsCSV(report).split("\n")[1]).toBe("Generated: 1‏/10‏/2026، 12:00:00 ص")
      }
    } finally { restore() }
  })

  it("shows loading then a real rejection after the configured retry, never fake totals", async () => {
    let reject!: (error: Error) => void
    generate.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
      .mockRejectedValue(new Error("report unavailable"))
    renderPage()
    generateReport()
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("button", { name: "تحميل CSV" })).toBeNull()
    await waitFor(() => expect(screen.getAllByRole("button").some(button => button.hasAttribute("disabled"))).toBe(true))
    reject(new Error("report unavailable"))
    expect((await screen.findByRole("alert")).textContent).toContain("report unavailable")
    expect(generate).toHaveBeenCalledTimes(2)
    expect(screen.queryByText("القيمة الإجمالية")).toBeNull()
    expect(screen.queryByRole("button", { name: "تحميل CSV" })).toBeNull()
  })

  it("renders an authoritative empty report as zero, with a CSV download", async () => {
    const empty = exactReportSchema.parse({ ...inventory, summary: { totalAssetsDzd: "0.00", totalConsumablesDzd: "0.00", totalValueDzd: "0.00" }, byLocation: [] })
    generate.mockResolvedValue(empty)
    const createObjectURL = vi.fn(() => "blob:report")
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL })
    const downloads: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download) })
    renderPage()
    generateReport()
    fireEvent.click(await screen.findByRole("button", { name: "تحميل CSV" }))
    expect(screen.getAllByText("0", { selector: "bdi" })).toHaveLength(3)
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(downloads[0]).toMatch(/^report-inventory-\d+\.csv$/)
    click.mockRestore()
    expect(formatReportAsCSV(empty)).toContain("Total Value (DZD),0.00")
  })

  it("keeps Escape dismissal and focus return on the date picker", async () => {
    renderPage()
    const trigger = document.querySelector<HTMLElement>('[data-slot="popover-trigger"]')!
    fireEvent.click(trigger)
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(generate).not.toHaveBeenCalled()
  })
})
