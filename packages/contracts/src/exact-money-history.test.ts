import { expect, it } from "vitest";
import { ExactLine, Money, Quantity, UnitPrice, finalizeLines, sumExactLineHistory, sumMoneyReports } from "./exact-money";

it("rounds accumulated source history once without document count or int64 result limits", () => {
  const halfCent = ExactLine.fromPrice(UnitPrice.parse("0.0050"), Quantity.parse("1"));
  expect(sumExactLineHistory(Array.from({ length: 10001 }, () => halfCent))).toBe("50.01");
  const maximum = ExactLine.fromTotal(Money.parse("92233720368547758.07"), Quantity.parse("1"));
  expect(sumExactLineHistory([maximum, maximum])).toBe("184467440737095516.14");
  expect(() => finalizeLines([maximum, maximum])).toThrow(/bounds/);
  expect(() => finalizeLines(Array(10001).fill(halfCent))).toThrow(/operations/);
  const negativeHalf = ExactLine.fromPrice(UnitPrice.parse("-0.0050"), Quantity.parse("1"));
  expect(sumExactLineHistory([negativeHalf])).toBe("-0.01");
  expect(sumMoneyReports(["184467440737095516.14", "0.30"])).toBe("184467440737095516.44");
  expect(sumMoneyReports(["-0.01", "1.00"])).toBe("0.99");
  expect(() => sumMoneyReports(["1e2"])).toThrow();
});
