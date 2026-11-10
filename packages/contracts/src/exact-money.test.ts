import { describe, expect, it } from "vitest";
import { Money, UnitPrice, Quantity, SalaryReference, priceLine, agreedLine, derivedPrice, finalizeLines, sumMoney, allocateMoney, reverseAllocations, parseExactLine } from "./exact-money";

describe("exact money input and wire", () => {
  it("round-trips every digit beyond Number precision and formats without forced decimals", () => {
    const amount = Money.parse("90071992547409.93", "DZD");
    expect(amount.toMinorUnits()).toBe("9007199254740993");
    expect(amount.toWire()).toBe("90071992547409.93");
    expect(Money.parse("1200").format()).toBe("1200");
    expect(Money.parse("-0.00").toWire()).toBe("0.00");
    expect(Money.parse("-1234567.50").format({ grouped: true })).toBe("-1,234,567.5");
    expect(Money.parse("1").format({ optionalDecimals: false })).toBe("1.00");
    expect(JSON.stringify({ amount })).toBe('{"amount":"90071992547409.93"}');
  });
  it.each([1, 0.1, null, undefined, "", " 1", "1 ", "+1", "01", ".5", "1.", "1e3", "0x10", "Infinity", "NaN", "1,000", "١٢", "1.001", "1.000", "9".repeat(97)])("rejects noncanonical or overprecise input %s", value => {
    expect(() => Money.parse(value)).toThrow();
  });
  it("does not turn missing, null and zero into the same value", () => {
    expect(() => Money.parse(undefined)).toThrow();
    expect(() => Money.parse(null)).toThrow();
    expect(Money.parse("0").toWire()).toBe("0.00");
    expect(() => Money.parse("1", "USD")).toThrow(/currency/);
    expect(() => Money.fromMinorUnits(1)).toThrow();
    const incompatible = { currency: "USD", toMinorUnits: () => "1" } as unknown as Money;
    expect(() => Money.parse("1").add(incompatible)).toThrow(/currency/);
    expect(() => sumMoney([incompatible])).toThrow(/currency/);
    expect(() => allocateMoney(incompatible, [{ id: "a", weight: "1" }])).toThrow(/currency/);
  });
  it("checks reversal-safe endpoints and resulting values", () => {
    const max = Money.parse("92233720368547758.07");
    expect(max.toMinorUnits()).toBe("9223372036854775807");
    expect(max.negate().toWire()).toBe("-92233720368547758.07");
    expect(max.negate().negate().toWire()).toBe(max.toWire());
    expect(() => Money.fromMinorUnits("-9223372036854775808")).toThrow(/bounds/);
    expect(() => Money.parse("92233720368547758.08")).toThrow(/bounds/);
    expect(() => max.add(Money.parse("0.01"))).toThrow(/bounds/);
    expect(() => max.negate().subtract(Money.parse("0.01"))).toThrow(/bounds/);
    expect(Money.parse("0.1").add(Money.parse("0.2")).toWire()).toBe("0.30");
    expect(Money.parse("0.75").subtract(Money.parse("0.25")).toWire()).toBe("0.50");
    expect(sumMoney([max, max])).toBe("184467440737095516.14");
  });
});

describe("exact source operands and document finalization", () => {
  const q = (value: string) => Quantity.parse(value);
  const p = (value: string) => UnitPrice.parse(value);
  it("sums exact products before one signed finalization", () => {
    const line = priceLine(p("0.125"), q("3"));
    expect(line.source).toEqual({ mode: "unit-price", price: "0.1250", quantity: "3" });
    expect(finalizeLines([line]).toWire()).toBe("0.38");
    expect(finalizeLines([line, line]).toWire()).toBe("0.75");
    expect(finalizeLines([priceLine(p("-0.125"), q("3"))]).toWire()).toBe("-0.38");
    expect(finalizeLines([priceLine(p("-0.0001"), q("1"))]).toWire()).toBe("0.00");
    expect(finalizeLines([priceLine(p("0.374"), q("1"))]).toWire()).toBe("0.37");
    expect(finalizeLines([]).toWire()).toBe("0.00");
  });
  it("retains ten-place products and wider intermediate coefficients", () => {
    expect(finalizeLines([priceLine(p("0.1234"), Quantity.inventory("1.234567"))]).toWire()).toBe("0.15");
    expect(finalizeLines([priceLine(p("922337203685477.5807"), q("100"))]).toWire()).toBe("92233720368547758.07");
    expect(() => finalizeLines([priceLine(p("922337203685477.5807"), q("101"))])).toThrow(/bounds/);
    expect(() => p("922337203685477.5808")).toThrow();
    expect(() => p("0.12345")).toThrow(/4 decimal/);
    expect(() => Quantity.inventory("1.0000001")).toThrow(/6 decimal/);
    expect(q("0.123456789").toWire()).toBe("0.123456789");
  });
  it("keeps agreed totals and derived-rate operands authoritative", () => {
    const total = Money.parse("10000");
    const quantity = q("300");
    const line = agreedLine(total, quantity);
    expect(line.source).toEqual({ mode: "agreed-total", total: "10000.00", quantity: "300" });
    expect(finalizeLines([line]).toWire()).toBe("10000.00");
    const price = derivedPrice(total, quantity);
    expect(price.source).toEqual({ total: "10000.00", quantity: "300" });
    expect(finalizeLines([price.line(q("300"))]).toWire()).toBe("10000.00");
    expect(finalizeLines([price.line(q("1"))]).toWire()).toBe("33.33");
    expect(finalizeLines([derivedPrice(Money.parse("1"), q("3")).line(q("0.015"))]).toWire()).toBe("0.01");
    expect(finalizeLines([parseExactLine(JSON.parse(JSON.stringify(line))) ]).toWire()).toBe("10000.00");
    expect(finalizeLines([parseExactLine({ mode: "unit-price", price: "0.1250", quantity: "3" })]).toWire()).toBe("0.38");
    expect(finalizeLines([parseExactLine({ mode: "derived-price", total: "1.00", originalQuantity: "3", quantity: "0.015" })]).toWire()).toBe("0.01");
    expect(() => parseExactLine({ mode: "derived-price", price: "0.3333", quantity: "3" })).toThrow();
    expect(() => parseExactLine({ mode: "unit-price", price: 1, quantity: "3" })).toThrow();
    expect(() => parseExactLine(null)).toThrow();
    expect(() => parseExactLine(line.source, "USD")).toThrow(/currency/);
    expect(() => derivedPrice(total, q("0"))).toThrow();
    expect(() => agreedLine(total, q("-1"))).toThrow();
  });
  it("retains salary period/scale without implementing earnings policy", () => {
    expect(SalaryReference.parse("DAILY", "1500.125").toWire()).toEqual({ period: "DAILY", amount: "1500.1250" });
    expect(SalaryReference.parse("DAILY", "1200").format()).toBe("1200");
    expect(SalaryReference.parse("MONTHLY", "30000").toWire()).toEqual({ period: "MONTHLY", amount: "30000.00" });
    expect(SalaryReference.parse("WEEKLY", "7000").toWire()).toEqual({ period: "WEEKLY", amount: "7000.00" });
    expect(() => SalaryReference.parse("MONTHLY", "1500.125")).toThrow();
    expect(() => SalaryReference.parse("DAILY", "1.00001")).toThrow();
    expect(() => SalaryReference.parse("YEARLY", "1")).toThrow();
    expect(finalizeLines([priceLine(p("1500.125"), q("8"))]).toWire()).toBe("12001.00");
    expect(finalizeLines([derivedPrice(Money.parse("1000"), q("30")).line(q("3"))]).toWire()).toBe("100.00");
  });
});

describe("recorded-order conserving automatic allocation", () => {
  const shares = [{ id: "first", weight: "1" }, { id: "second", weight: "1" }, { id: "third", weight: "1" }];
  it("assigns ties by recorded order and reverses records without redistribution", () => {
    const result = allocateMoney(Money.parse("100"), shares);
    expect(result.map(r => [r.id, r.amount.toWire()])).toEqual([["first", "33.34"], ["second", "33.33"], ["third", "33.33"]]);
    expect(reverseAllocations([result[2]!, result[0]!, result[1]!]).map(r => [r.id, r.amount.toWire()])).toEqual([["third", "-33.33"], ["first", "-33.34"], ["second", "-33.33"]]);
    expect(sumMoney(result.map(r => r.amount))).toBe("100.00");
  });
  it("uses largest remainders, handles negative/zero and explicit partial target", () => {
    const weighted = [{ id: "a", weight: "1" }, { id: "b", weight: "3" }, { id: "c", weight: "3" }];
    expect(allocateMoney(Money.parse("0.05"), weighted).map(r => r.amount.toWire())).toEqual(["0.01", "0.02", "0.02"]);
    expect(allocateMoney(Money.parse("-0.05"), weighted).map(r => r.amount.toWire())).toEqual(["-0.01", "-0.02", "-0.02"]);
    expect(allocateMoney(Money.parse("0.00"), shares).map(r => r.amount.toWire())).toEqual(["0.00", "0.00", "0.00"]);
    expect(allocateMoney(Money.parse("0.02"), [{ id: "a", weight: "0" }, { id: "b", weight: "0.1" }, { id: "c", weight: "0.2" }]).map(r => r.amount.toWire())).toEqual(["0.00", "0.01", "0.01"]);
    const target = Money.parse("75");
    expect(sumMoney(allocateMoney(target, shares).map(r => r.amount))).toBe("75.00");
    expect(Money.parse("100").subtract(target).toWire()).toBe("25.00");
  });
  it("rejects ambiguous identities, invalid weights and unbounded resources", () => {
    expect(() => allocateMoney(Money.parse("1"), [])).toThrow();
    expect(() => allocateMoney(Money.parse("1"), [{ id: "x", weight: "0" }])).toThrow();
    expect(() => allocateMoney(Money.parse("1"), [{ id: "x", weight: "-1" }])).toThrow();
    expect(() => allocateMoney(Money.parse("1"), [{ id: "x", weight: "1" }, { id: "x", weight: "2" }])).toThrow();
    expect(() => sumMoney(Array(10001).fill(Money.parse("0")))).toThrow(/operations/);
    expect(() => finalizeLines(Array(10001).fill(priceLine(UnitPrice.parse("1"), Quantity.parse("1"))))).toThrow(/operations/);
  });
});
