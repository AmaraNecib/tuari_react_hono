// @vitest-environment jsdom

import "@/i18n"

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SystemLogEntry } from "@tuari/contracts"

import { format } from "date-fns"

import { setDateFormat } from "@/features/preferences/date-format-preference"
import { toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { AuditLogPage } from "./audit-log-page"
import { MIDNIGHT_CROSSING, pinUtcTimeZone } from "@/test-utils/algeria-day"

const { systemLogList } = vi.hoisted(() => ({ systemLogList: vi.fn() }))

vi.mock("@/lib/orpc-client", () => ({
  rpcClient: { systemLogList },
  orpc: { session: { queryOptions: () => ({ queryKey: ["session"] }) } },
}))

vi.mock("@/features/session/use-session-query", () => ({ useSessionQuery: () => ({ data: { user: { id: "user-1" } } }) }))

function logEntry(overrides: Pick<SystemLogEntry, "id" | "createdAt" | "summary">): SystemLogEntry {
  return {
    id: overrides.id,
    transactionId: null,
    actorUserId: "user-1",
    actorLabel: "مدير التشغيل",
    actorCurrentLabel: null,
    actionType: "ACCOUNT_UPDATED",
    entityType: "ACCOUNT",
    entityId: "account-1",
    entityLabel: "حساب",
    summary: overrides.summary,
    detail: null,
    createdAt: overrides.createdAt,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><AuditLogPage /></QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  setDateFormat("DD/MM/YYYY")
  vi.clearAllMocks()
})

/**
 * The audit log sends its date range through the shared query to the server.
 * The end bound must include the whole picked day (#428 round 2): before
 * the fix a bare `yyyy-MM-dd` parsed as UTC midnight and dropped every log
 * written after 00:00 on the picked end date.
 */
describe("AuditLogPage end-of-day range boundary", () => {
  it("renders and exports audit instants in Algeria under a UTC machine", async () => {
    const restore = pinUtcTimeZone()
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob.type).toBe("text/csv;charset=utf-8;")
      return "blob:test-export"
    })
    vi.stubGlobal("URL", { createObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    try {
      systemLogList.mockResolvedValue({ items: [logEntry({
        id: "midnight-log", createdAt: MIDNIGHT_CROSSING, summary: "حدث اختباري",
      })] })
      renderPage()
      const day = await screen.findByText("01/10/2026", { selector: 'bdi[dir="ltr"]' })
      const timestamp = day.parentElement!
      expect(timestamp.textContent).toContain("12:00:00 ص")
      expect(timestamp.textContent).not.toContain("30/09/2026")
      act(() => setDateFormat("YYYY/MM/DD"))
      expect(day.textContent).toBe("2026/10/01")
      expect(timestamp.textContent).toContain("12:00:00 ص")
      for (const [order, expected] of [
        ["DD/MM/YYYY", "01/10/2026"], ["MM/DD/YYYY", "10/01/2026"],
        ["YYYY/MM/DD", "2026/10/01"], ["YYYY/DD/MM", "2026/01/10"],
      ] as const) {
        act(() => setDateFormat(order))
        fireEvent.click(screen.getByRole("button", { name: "تصدير CSV" }))
        const blob = createObjectURL.mock.calls.at(-1)![0] as Blob
        const csv = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsText(blob)
        })
        expect(csv.split("\n")[1]).toBe(`"${expected} 12:00:00 ص","مدير التشغيل","الحساب","تحديث الحساب","account-1","حدث اختباري"`)
        expect(csv).not.toMatch(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/)
      }
      expect(createObjectURL).toHaveBeenCalledTimes(4)
      expect(systemLogList).toHaveBeenCalledOnce()
    } finally {
      restore()
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    }
  })

  it("exports all filtered rows beyond the visible page, not hidden search results", async () => {
    const items = Array.from({ length: 22 }, (_, index) => logEntry({
      id: `row-${index}`, createdAt: MIDNIGHT_CROSSING, summary: `selected-${index}`,
    }))
    items.push(logEntry({ id: "excluded", createdAt: MIDNIGHT_CROSSING, summary: "unrelated" }))
    const original = JSON.stringify(items)
    systemLogList.mockResolvedValue({ items })
    const blobs: Blob[] = []
    vi.stubGlobal("URL", { createObjectURL: (blob: Blob) => { blobs.push(blob); return "blob:audit" } })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    try {
      renderPage()
      await screen.findByText("selected-0")
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "selected-" } })
      expect(screen.queryByText("selected-21")).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: "تصدير CSV" }))
      const csv = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsText(blobs[0]!)
      })
      expect(csv.split("\n")).toHaveLength(23)
      expect(csv).toContain('"selected-21"')
      expect(csv).not.toContain("unrelated")
      expect(JSON.stringify(items)).toBe(original)
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "no-match" } })
      expect(screen.queryByRole("button", { name: "تصدير CSV" })).toBeNull()
    } finally { click.mockRestore(); vi.unstubAllGlobals() }
  })

  it("includes a log written at 23:59 on the picked end date and excludes the next day", async () => {
    // The end picker starts empty, so its calendar opens on the SYSTEM month.
    // Anchor the target day to the system clock, not the Algeria day: near a
    // month boundary the two months differ and the cell would not render.
    const endDay = format(new Date(), "yyyy-MM-dd")
    const lastMillisecond = toAlgeriaDayBoundaryIso(endDay, "end")!
    const dayAfter = new Date(Date.parse(lastMillisecond) + 1).toISOString()

    const items = [
      logEntry({ id: "log-on-end-day", createdAt: lastMillisecond, summary: "حدث في نهاية اليوم" }),
      logEntry({ id: "log-next-day", createdAt: dayAfter, summary: "حدث بعد منتصف الليل" }),
    ]
    systemLogList.mockImplementation(async (filters) => ({
      items: items.filter((entry) => !filters?.toDate || entry.createdAt <= filters.toDate),
    }))

    renderPage()

    // Both logs render while no range is selected.
    await screen.findByText("حدث في نهاية اليوم")
    expect(screen.getByText("حدث بعد منتصف الليل")).toBeTruthy()

    // Pick the end day (the second DatePicker in the range filter).
    const triggers = document.querySelectorAll<HTMLElement>('[data-slot="popover-trigger"]')
    expect(triggers).toHaveLength(2)
    fireEvent.click(triggers[1]!)
    const cell = document.querySelector(`[data-day="${endDay}"]`)
    expect(cell, `day ${endDay} not found`).not.toBeNull()
    fireEvent.click(cell!.querySelector("button") ?? (cell as HTMLElement))

    // Wait for the new server-filtered query before checking the rows.
    await screen.findByText("حدث في نهاية اليوم")
    expect(systemLogList).toHaveBeenLastCalledWith(expect.objectContaining({ toDate: lastMillisecond }))
    await waitFor(() => expect(screen.queryByText("حدث بعد منتصف الليل")).toBeNull())
  })
})
