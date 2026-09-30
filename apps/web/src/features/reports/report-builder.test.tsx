// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"

import { format } from "date-fns"

import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { ReportBuilder } from "./report-builder"

const { reportsGenerate } = vi.hoisted(() => ({ reportsGenerate: vi.fn() }))

vi.mock("@/lib/orpc-client", () => ({
  rpcClient: { reportsGenerate },
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ReportBuilder /></QueryClientProvider>)
}

function pickDay(triggerIndex: number, day: string) {
  const trigger = document.querySelectorAll<HTMLElement>('[data-slot="popover-trigger"]')[triggerIndex]
  expect(trigger, `date picker #${triggerIndex} not found`).toBeTruthy()
  fireEvent.click(trigger!)
  const cell = document.querySelector(`[data-day="${day}"]`)
  expect(cell, `day ${day} not found`).not.toBeNull()
  fireEvent.click(cell!.querySelector("button") ?? (cell as HTMLElement))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * The report builder's range must reach the wire as inclusive Algeria instants
 * (#428 round 2): the contract wants ISO-8601 datetimes, and the picked end day
 * must include everything written on it (end-of-day), not a bare day that
 * parses as UTC midnight.
 *
 * Both pickers start empty, so the calendar opens on the SYSTEM month; the
 * target days are anchored to it, not the Algeria day (which can differ by one
 * month near a month boundary).
 */
describe("ReportBuilder range boundary", () => {
  it(
    "sends the picked range as inclusive start/end-of-day instants",
    async () => {
      reportsGenerate.mockResolvedValue({
        type: "INVENTORY",
        generatedAt: "2026-10-15T00:00:00.000Z",
        summary: { totalAssetsDzd: 100, totalConsumablesDzd: 50, totalValueDzd: 150 },
        byLocation: [],
        byItemType: [],
        agingAnalysis: [],
      })

      const month = format(new Date(), "yyyy-MM")
      const fromDay = `${month}-10`
      const toDay = `${month}-15`

      renderPage()

      pickDay(0, fromDay)
      pickDay(1, toDay)
      fireEvent.click(screen.getByRole("button", { name: "إنشاء التقرير" }))

      await waitFor(() => expect(reportsGenerate).toHaveBeenCalledTimes(1))
      expect(reportsGenerate).toHaveBeenCalledWith({
        type: "INVENTORY",
        startDate: toAlgeriaDayBoundaryIso(fromDay, "start"),
        endDate: toAlgeriaDayBoundaryIso(toDay, "end"),
      })
    },
    // Full-page mount plus two calendar interactions is heavy; the 5s default
    // times out when the shared machine is loaded (observed in a full-suite
    // run at ~5.2s). The assertions, not the timeout, are the guard.
    15000,
  )

  it("does not stamp a direction phrase on the gross outstanding/overdue totals", async () => {
    reportsGenerate.mockResolvedValue({
      type: "DEBT",
      generatedAt: "2026-10-15T00:00:00.000Z",
      summary: { totalOutstandingDzd: 5000, totalSettledDzd: 1000, overdueDzd: 2000, partyCount: 2 },
      agingBreakdown: [],
      byParty: [],
      topDebtors: [],
    })

    renderPage()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "DEBT" } })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء التقرير" }))

    await waitFor(() => expect(screen.getByText("الديون المتبقية")).toBeTruthy())
    // totalOutstandingDzd/overdueDzd aggregate BOTH PAYABLE and RECEIVABLE
    // directions (gross exposure), so a single direction phrase is a false
    // claim. The settled bucket stays labelled.
    expect(screen.queryByText("مستحق لنا")).toBeNull()
    expect(screen.getByText("مسوّى")).toBeTruthy()
  }, 15000)
})
