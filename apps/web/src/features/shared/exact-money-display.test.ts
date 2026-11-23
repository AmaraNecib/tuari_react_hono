import { describe, expect, it } from "vitest"
import { formatExactMoney } from "./exact-money-display"

describe("exact report and persisted amount presentation", () => {
  it("permits a wide canonical total only with explicit aggregate authority", () => {
    expect(formatExactMoney("184467440737095516.14", { aggregate: true, grouped: true }).text).toBe("184,467,440,737,095,516.14")
    expect(() => formatExactMoney("184467440737095516.14")).toThrow(/bounds/)
    expect(formatExactMoney("-0.00", { aggregate: true, signed: true })).toEqual({ text: "+0", zero: true })
    expect(formatExactMoney("-1234.50", { grouped: true, signed: true })).toEqual({ text: "-1,234.5", zero: false })
  })
  it.each(["1e3", "01.00", "1.005", "1", "NaN", "1,000.00", "9".repeat(257) + ".00"])("rejects noncanonical aggregate %j", value => {
    expect(() => formatExactMoney(value, { aggregate: true })).toThrow()
  })
})
