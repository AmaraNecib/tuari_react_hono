import { describe, expect, it } from "vitest"

import { formatAlgeriaDate, formatDateTimeInAlgeria, getAlgeriaDateInputValue, toAlgeriaDayBoundaryIso } from "./algeria-time"
import { resolveDateFormat, type DateFormat } from "./date-format"

describe("numeric date presentation", () => {
  it("defaults to padded day/month/year without bidi controls on the real expense instant", () => {
    expect(formatAlgeriaDate("2026-11-10T12:00:00.000Z")).toBe("10/11/2026")
    expect(formatAlgeriaDate("2026-04-03T12:00:00.000Z")).toBe("03/04/2026")
  })
  it.each<[DateFormat, string]>([
    ["DD/MM/YYYY", "23/04/2026"], ["MM/DD/YYYY", "04/23/2026"],
    ["YYYY/MM/DD", "2026/04/23"], ["YYYY/DD/MM", "2026/23/04"],
  ])("renders %s with literal numeric order", (order, expected) => {
    expect(formatAlgeriaDate("2026-04-23", "ar-DZ", order)).toBe(expected)
    expect(formatDateTimeInAlgeria(new Date("2026-04-23T12:04:05Z"), "ar-DZ", order, "medium")).toBe(expected + " 1:04:05 م")
  })
  it("validates unknown formats and preserves invalid-date fallback", () => {
    expect(resolveDateFormat("dd-mm-yyyy")).toBe("DD/MM/YYYY")
    expect(resolveDateFormat(null)).toBe("DD/MM/YYYY")
    expect(formatAlgeriaDate("invalid")).toBe("—")
    expect(formatDateTimeInAlgeria(new Date(Number.NaN))).toBe("—")
  })
  it("keeps leap days, both sides of Algeria midnight, and canonical boundaries", () => {
    expect(formatAlgeriaDate("2028-02-29")).toBe("29/02/2028")
    expect(formatAlgeriaDate("2028-02-28T22:59:59.999Z")).toBe("28/02/2028")
    expect(formatAlgeriaDate("2028-02-28T23:00:00.000Z")).toBe("29/02/2028")
    expect(getAlgeriaDateInputValue(new Date("2028-02-28T23:00:00Z"))).toBe("2028-02-29")
    expect(toAlgeriaDayBoundaryIso("2028-02-29", "start")).toBe("2028-02-28T23:00:00.000Z")
  })
  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])("ignores machine timezone %s for stored instants", (zone) => {
    const previous = process.env.TZ
    try {
      process.env.TZ = zone
      expect(formatAlgeriaDate("2026-12-31T23:30:00Z")).toBe("01/01/2027")
      expect(formatDateTimeInAlgeria(new Date("2026-12-31T23:30:00Z"))).toBe("01/01/2027 12:30 ص")
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })
  it("retains explicit locale digits and clock conventions without locale date-order controls", () => {
    expect(formatAlgeriaDate("2026-04-23", "ar-EG", "YYYY/DD/MM")).toBe("٢٠٢٦/٢٣/٠٤")
    expect(formatDateTimeInAlgeria(new Date("2026-04-23T12:04:05Z"), "en-GB")).toBe("23/04/2026 13:04")
  })
})
