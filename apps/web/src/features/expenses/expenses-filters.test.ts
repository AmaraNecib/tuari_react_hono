import { describe, expect, it } from "vitest"

import { buildExpenseFilters, getCurrentMonthExpenseDates } from "./expenses-filters"

describe("getCurrentMonthExpenseDates", () => {
  it.each([
    ["2026-09-30T23:30:00.000Z", "2026-10-01", "2026-10-31"],
    ["2026-12-31T23:30:00.000Z", "2027-01-01", "2027-01-31"],
    ["2024-02-15T12:00:00.000Z", "2024-02-01", "2024-02-29"],
    ["2026-02-15T12:00:00.000Z", "2026-02-01", "2026-02-28"],
    ["2026-04-15T12:00:00.000Z", "2026-04-01", "2026-04-30"],
    ["2026-12-15T12:00:00.000Z", "2026-12-01", "2026-12-31"],
  ])("uses the whole Algeria month at %s", (instant, fromDate, toDate) => {
    expect(getCurrentMonthExpenseDates(new Date(instant))).toEqual({ fromDate, toDate })
  })
})

describe("buildExpenseFilters", () => {
  it("expands the date inputs to inclusive Algeria day boundaries", () => {
    expect(
      buildExpenseFilters({
        projectId: null,
        responsibleWorkerId: null,
        fromDate: "2026-10-01",
        toDate: "2026-10-31",
      }),
    ).toEqual({
      fromDate: "2026-09-30T23:00:00.000Z",
      toDate: "2026-10-31T22:59:59.999Z",
    })
  })

  it("includes a selected project and worker", () => {
    const filters = buildExpenseFilters({
      projectId: "project-1",
      responsibleWorkerId: "worker-1",
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
    })

    expect(filters.projectId).toBe("project-1")
    expect(filters.responsibleWorkerId).toBe("worker-1")
  })

  it("omits empty selects and unparseable dates", () => {
    expect(
      buildExpenseFilters({
        projectId: null,
        responsibleWorkerId: null,
        fromDate: "",
        toDate: "",
      }),
    ).toEqual({})
  })
})
