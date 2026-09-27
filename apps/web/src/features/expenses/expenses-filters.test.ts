import { describe, expect, it } from "vitest"

import { buildExpenseFilters, getDefaultExpenseDateRange } from "./expenses-filters"

describe("getDefaultExpenseDateRange", () => {
  it("defaults to the current month to date", () => {
    expect(getDefaultExpenseDateRange("2026-10-11")).toEqual({
      fromDate: "2026-10-01",
      toDate: "2026-10-11",
    })
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
