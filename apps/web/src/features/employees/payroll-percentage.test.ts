import { describe, expect, it } from "vitest"
import { paymentFromPercentage, paymentPercentage, previewPayrollPayment } from "./payroll-percentage"

describe("approved-earned payment calculator", () => {
  it("uses the approved total and previews prior settlement separately", () => {
    expect(paymentFromPercentage("60000.00", "50")).toBe("30000.00")
    expect(paymentPercentage("30000.00", "60000.00")).toEqual({ value: "50", approximate: false })
    expect(previewPayrollPayment("60000.00", "48000.00", "36000.00")).toEqual({
      amount: "36000.00", remaining: "12000.00", cumulative: { value: "80", approximate: false },
      outstanding: { value: "20", approximate: false },
    })
  })

  it("rounds half cents away from zero without floating point drift", () => {
    expect(paymentFromPercentage("0.01", "50")).toBe("0.01")
    expect(paymentFromPercentage("0.03", "50")).toBe("0.02")
    expect(paymentFromPercentage("100.01", "25")).toBe("25.00")
    expect(paymentPercentage("0.01", "0.03")).toEqual({ value: "33.33", approximate: true })
    expect(paymentPercentage("0.03", "0.03")).toEqual({ value: "100", approximate: false })
  })

  it.each(["", "0", "-1", "101", "1e1", "50%", "1,5", "NaN", "0.0000001", "1.2.3"])("rejects malformed or out-of-range percentage %s", value => {
    expect(() => paymentFromPercentage("60000.00", value)).toThrow()
  })

  it("accepts Arabic digits and decimal separator", () => {
    expect(paymentFromPercentage("60000.00", "٥٠٫٥")).toBe("30300.00")
  })

  it("rejects zero totals, zero rounded payments and excessive ordinary settlement", () => {
    expect(() => paymentFromPercentage("0.00", "50")).toThrow()
    expect(() => paymentFromPercentage("0.01", "1")).toThrow()
    expect(() => paymentPercentage("1.00", "0.00")).toThrow()
    for (const amount of ["0", "-1", "48000.01"]) {
      expect(() => previewPayrollPayment("60000.00", "48000.00", amount)).toThrow()
    }
    expect(previewPayrollPayment("60000.00", "12345.67", "12345.67").remaining).toBe("0.00")
  })
})
