// @vitest-environment jsdom

import "@/i18n"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SystemLogEntry } from "@tuari/contracts"

import { getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "@/lib/algeria-time"
import { AuditLogPage } from "./audit-log-page"

const { systemLogList } = vi.hoisted(() => ({ systemLogList: vi.fn() }))

vi.mock("@/lib/orpc-client", () => ({
  rpcClient: { systemLogList },
}))

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
  vi.clearAllMocks()
})

/**
 * The audit log's date range is applied client-side over the fetched system
 * log. The end bound must include the whole picked day (#428 round 2): before
 * the fix a bare `yyyy-MM-dd` parsed as UTC midnight and dropped every log
 * written after 00:00 on the picked end date.
 */
describe("AuditLogPage end-of-day range boundary", () => {
  it("includes a log written at 23:59 on the picked end date and excludes the next day", async () => {
    const today = getAlgeriaDateInputValue()
    const endDay = `${today.slice(0, 7)}-15`
    const lastMillisecond = toAlgeriaDayBoundaryIso(endDay, "end")!
    const dayAfter = new Date(Date.parse(lastMillisecond) + 1).toISOString()

    systemLogList.mockResolvedValue({
      items: [
        logEntry({ id: "log-on-end-day", createdAt: lastMillisecond, summary: "حدث في نهاية اليوم" }),
        logEntry({ id: "log-next-day", createdAt: dayAfter, summary: "حدث بعد منتصف الليل" }),
      ],
    })

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

    // 23:59 on the end day stays; 00:00 the next day is filtered out.
    expect(screen.getByText("حدث في نهاية اليوم")).toBeTruthy()
    await waitFor(() => expect(screen.queryByText("حدث بعد منتصف الليل")).toBeNull())
  })
})
