import { describe, expect, it } from "vitest";
import { parseLocalizedMoneyInput, parseLocalizedUnitPriceInput } from "./exact-money-input";

describe("exact finalized-money form submission", () => {
  it("parses four-place localized prices through the same grouping rules without rounding cash", () => {
    expect(parseLocalizedUnitPriceInput("١٬٢٣٤٫٥٦٧٨").toWire()).toBe("1234.5678");
    expect(parseLocalizedUnitPriceInput("۹۲۲٬۳۳۷٬۲۰۳٬۶۸۵٬۴۷۷٫۵۸۰۷").toWire()).toBe("922337203685477.5807");
    expect(parseLocalizedUnitPriceInput(" 0012.5 ").toWire()).toBe("12.5000");
    expect(() => parseLocalizedMoneyInput("١٬٢٣٤٫٥٦٧٨")).toThrow();
    for (const value of ["1.00001", "922337203685477.5808", "1,23", "1,234٬567", "1e4", "", "\u202e12"]) expect(() => parseLocalizedUnitPriceInput(value)).toThrow();
  });
  it.each([
    ["90071992547409.93", "90071992547409.93"],
    ["92,233,720,368,547,758.07", "92233720368547758.07"],
    ["١٬٢٣٤٫٥٦", "1234.56"],
    ["۱۲۳۴٫۵۶", "1234.56"],
    ["1\u202f234.50", "1234.50"],
    [" 0012.5 ", "12.50"],
    [".25", "0.25"],
    ["12.", "12.00"],
    ["-0.00", "0.00"],
  ])("preserves %s without binary-number conversion", (input, expected) => {
    expect(parseLocalizedMoneyInput(input).toWire()).toBe(expected);
  });

  it.each(["", " ", "-", "1e3", "NaN", "Infinity", "0x10", "1.005", "1,23", "1,234٬567", "1.2٫3", "1 23", "12,50", "92233720368547758.08", "1".repeat(200), "\u202e12"]) ("rejects ambiguous or invalid submission %j", input => {
    expect(() => parseLocalizedMoneyInput(input)).toThrow();
  });
});
