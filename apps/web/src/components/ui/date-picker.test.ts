// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import { fromDatePickerValue, toDatePickerValue } from "./date-picker"

/**
 * The shared DatePicker displays and returns `dd/MM/yyyy`, while the app's
 * canonical day value (`getAlgeriaDateInputValue`, `toAlgeriaDayBoundaryIso`)
 * is `yyyy-MM-dd`. These adapters are the seam between the two, so the
 * expenses form can prefill an existing date and still submit a parseable day.
 */
describe("DatePicker value adapters", () => {
  it("converts the app's yyyy-MM-dd day to the picker's dd/MM/yyyy value", () => {
    expect(toDatePickerValue("2026-10-01")).toBe("01/10/2026")
  })

  it("converts the picker's dd/MM/yyyy value back to a yyyy-MM-dd day", () => {
    expect(fromDatePickerValue("01/10/2026")).toBe("2026-10-01")
  })

  it("round-trips a day through both adapters", () => {
    expect(fromDatePickerValue(toDatePickerValue("2026-10-01"))).toBe("2026-10-01")
  })

  it("passes an empty value through so the placeholder still renders", () => {
    expect(toDatePickerValue("")).toBe("")
    expect(fromDatePickerValue("")).toBe("")
  })
})
