import { describe, expect, it } from "vitest"

import {
  SALARY_PERIOD_FILTER_VALUES,
  getSalaryPeriodLabelKey,
} from "./salary-table-primitives"

/**
 * Pins the shared period vocabulary. `getSalaryPeriodLabelKey` is the single
 * mapping used by the salary tables *and* the employee details page (since
 * #453 folded the page's local copy into it), so this test is what keeps the
 * two from diverging again.
 */
describe("salary period vocabulary (#453)", () => {
  it("maps every period to its own label key, and null to the not-specified label", () => {
    expect(getSalaryPeriodLabelKey("DAILY")).toBe("detailPages.salary.daily")
    expect(getSalaryPeriodLabelKey("WEEKLY")).toBe("detailPages.salary.weekly")
    expect(getSalaryPeriodLabelKey("MONTHLY")).toBe("detailPages.salary.monthly")
    expect(getSalaryPeriodLabelKey(null)).toBe("detailPages.salary.notSpecified")
  })

  it("gives every period a distinct label (no copy-paste collision)", () => {
    const keys = [
      getSalaryPeriodLabelKey("DAILY"),
      getSalaryPeriodLabelKey("WEEKLY"),
      getSalaryPeriodLabelKey("MONTHLY"),
      getSalaryPeriodLabelKey(null),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("offers every period in the filter option list", () => {
    expect(SALARY_PERIOD_FILTER_VALUES).toEqual(["DAILY", "WEEKLY", "MONTHLY"])
  })
})
