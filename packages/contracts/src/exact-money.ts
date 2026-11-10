/** Inert V1 exact-money capability. Existing numeric contracts do not use it. */
const MAX = 9223372036854775807n;
const MAX_ITEMS = 10_000;
const MAX_DIGITS = 256;
export type MoneyCurrency = "DZD";
export type SalaryReferencePeriod = "DAILY" | "MONTHLY" | "WEEKLY";

function currency(value: unknown): MoneyCurrency {
  if (value !== "DZD") throw new TypeError("V1 money requires DZD; currency mismatch");
  return value;
}
function checked(value: bigint): bigint {
  if (value < -MAX || value > MAX) throw new RangeError("Money exceeds reversal-safe int64 bounds");
  return value;
}
function decimal(value: unknown, scale: number): bigint {
  if (typeof value !== "string" || value.length > 96 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new TypeError("Expected a bounded plain decimal string");
  }
  const [whole = "", fraction = ""] = value.split(".");
  if (fraction.length > scale) throw new RangeError(`Input permits at most ${scale} decimal places`);
  const negative = whole.startsWith("-");
  const magnitude = BigInt(whole.replace("-", "") + fraction.padEnd(scale, "0"));
  return negative ? -magnitude : magnitude;
}
function render(value: bigint, scale: number, optionalDecimals = false): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  let fraction = scale ? digits.slice(-scale) : "";
  if (optionalDecimals) fraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
function boundedItems(length: number): void {
  if (length > MAX_ITEMS) throw new RangeError("Too many money operations");
}

export class Money {
  readonly currency: MoneyCurrency;
  readonly #minor: bigint;
  private constructor(minor: bigint, code: unknown) {
    this.currency = currency(code);
    this.#minor = checked(minor);
    Object.freeze(this);
  }
  static parse(value: unknown, code: unknown = "DZD"): Money {
    return new Money(decimal(value, 2), code);
  }
  /** Exact storage codec. Rejects numbers, missing values and the asymmetric native endpoint. */
  static fromMinorUnits(value: unknown, code: unknown = "DZD"): Money {
    if (typeof value !== "string" || value.length > 20 || !/^-?(?:0|[1-9]\d*)$/.test(value)) {
      throw new TypeError("Expected an exact int64 minor-unit string");
    }
    return new Money(BigInt(value), code);
  }
  toMinorUnits(): string { return this.#minor.toString(); }
  toWire(): string { return render(this.#minor, 2); }
  toJSON(): string { return this.toWire(); }
  format(options: { grouped?: boolean; optionalDecimals?: boolean } = {}): string {
    const plain = render(this.#minor, 2, options.optionalDecimals ?? true);
    if (!options.grouped) return plain;
    const [whole = "", fraction] = plain.split(".");
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
  }
  add(other: Money): Money {
    currency(other.currency);
    return new Money(this.#minor + other.#minor, this.currency);
  }
  subtract(other: Money): Money { return this.add(other.negate()); }
  negate(): Money { return new Money(-this.#minor, this.currency); }
}

export class UnitPrice {
  readonly #units: bigint;
  private constructor(units: bigint) { this.#units = checked(units); Object.freeze(this); }
  static parse(value: unknown, code: unknown = "DZD"): UnitPrice {
    currency(code);
    return new UnitPrice(decimal(value, 4));
  }
  static fromScaledUnits(value: unknown, code: unknown = "DZD"): UnitPrice {
    currency(code);
    return new UnitPrice(BigInt(Money.fromMinorUnits(value).toMinorUnits()));
  }
  toScaledUnits(): string { return this.#units.toString(); }
  toWire(): string { return render(this.#units, 4); }
  toJSON(): string { return this.toWire(); }
  format(): string { return render(this.#units, 4, true); }
}

/** Finite quantity, separate from money. Inventory explicitly selects its existing six-place quantum. */
export class Quantity {
  readonly #coefficient: bigint;
  readonly #scale: number;
  private constructor(value: unknown, maxScale: number) {
    const coefficient = decimal(value, maxScale);
    this.#coefficient = coefficient;
    this.#scale = maxScale;
    Object.freeze(this);
  }
  static parse(value: unknown): Quantity { return new Quantity(value, 18); }
  static inventory(value: unknown): Quantity { return new Quantity(value, 6); }
  toWire(): string { return render(this.#coefficient, this.#scale, true); }
  toJSON(): string { return this.toWire(); }
}

export class SalaryReference {
  readonly period: SalaryReferencePeriod;
  readonly #amount: Money | UnitPrice;
  private constructor(period: SalaryReferencePeriod, amount: Money | UnitPrice) {
    this.period = period;
    this.#amount = amount;
    Object.freeze(this);
  }
  static parse(period: unknown, amount: unknown, code: unknown = "DZD"): SalaryReference {
    if (period !== "DAILY" && period !== "MONTHLY" && period !== "WEEKLY") throw new TypeError("Invalid salary reference period");
    const parsed = period === "DAILY" ? UnitPrice.parse(amount, code) : Money.parse(amount, code);
    if (parsed.toWire().startsWith("-")) throw new RangeError("Salary reference must be nonnegative");
    return new SalaryReference(period, parsed);
  }
  toWire(): { period: SalaryReferencePeriod; amount: string } {
    return { period: this.period, amount: this.#amount.toWire() };
  }
  toJSON(): { period: SalaryReferencePeriod; amount: string } { return this.toWire(); }
  format(): string { return this.#amount.format(); }
}

type PriceSource = Readonly<{ mode: "unit-price"; price: string; quantity: string }>;
type TotalSource = Readonly<{ mode: "agreed-total"; total: string; quantity: string }>;
type DerivedSource = Readonly<{ mode: "derived-price"; total: string; originalQuantity: string; quantity: string }>;
type Fraction = Readonly<{ numerator: bigint; denominator: bigint }>;
const lineValues = new WeakMap<ExactLine, Fraction>();

function limited(value: bigint): bigint {
  if (value.toString().length > MAX_DIGITS) throw new RangeError("Exact calculation resource limit exceeded");
  return value;
}
function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function fraction(numerator: bigint, denominator: bigint): Fraction {
  limited(numerator); limited(denominator);
  if (denominator <= 0n) throw new RangeError("Expected a positive denominator");
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}
function quantityParts(quantity: Quantity): Fraction {
  const wire = quantity.toWire();
  const scale = wire.split(".")[1]?.length ?? 0;
  return fraction(decimal(wire, scale), 10n ** BigInt(scale));
}
function positiveQuantity(quantity: Quantity): Fraction {
  const parts = quantityParts(quantity);
  if (parts.numerator <= 0n) throw new RangeError("Source quantity must be positive");
  return parts;
}

/** Source metadata is the wire value. There is no independently writable rounded line cache. */
export class ExactLine {
  readonly source: PriceSource | TotalSource | DerivedSource;
  private constructor(source: PriceSource | TotalSource | DerivedSource, value: Fraction) {
    this.source = Object.freeze(source);
    lineValues.set(this, value);
    Object.freeze(this);
  }
  static fromPrice(price: UnitPrice, quantity: Quantity): ExactLine {
    const q = quantityParts(quantity);
    return new ExactLine({ mode: "unit-price", price: price.toWire(), quantity: quantity.toWire() }, fraction(BigInt(price.toScaledUnits()) * q.numerator, 100n * q.denominator));
  }
  static fromTotal(total: Money, quantity: Quantity): ExactLine {
    positiveQuantity(quantity);
    return new ExactLine({ mode: "agreed-total", total: total.toWire(), quantity: quantity.toWire() }, fraction(BigInt(total.toMinorUnits()), 1n));
  }
  static fromDerived(total: Money, originalQuantity: Quantity, quantity: Quantity): ExactLine {
    const original = positiveQuantity(originalQuantity);
    const q = quantityParts(quantity);
    return new ExactLine({ mode: "derived-price", total: total.toWire(), originalQuantity: originalQuantity.toWire(), quantity: quantity.toWire() }, fraction(BigInt(total.toMinorUnits()) * q.numerator * original.denominator, q.denominator * original.numerator));
  }
  toJSON(): PriceSource | TotalSource | DerivedSource { return this.source; }
}
export const priceLine = ExactLine.fromPrice;
export const agreedLine = ExactLine.fromTotal;

/** Bounded source-mode wire decoder. A displayed approximate rate is never accepted as authority. */
export function parseExactLine(value: unknown, code: unknown = "DZD"): ExactLine {
  currency(code);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Expected exact line source metadata");
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort().join(",");
  if (row.mode === "unit-price" && keys === "mode,price,quantity") {
    return priceLine(UnitPrice.parse(row.price, code), Quantity.parse(row.quantity));
  }
  if (row.mode === "agreed-total" && keys === "mode,quantity,total") {
    return agreedLine(Money.parse(row.total, code), Quantity.parse(row.quantity));
  }
  if (row.mode === "derived-price" && keys === "mode,originalQuantity,quantity,total") {
    return ExactLine.fromDerived(Money.parse(row.total, code), Quantity.parse(row.originalQuantity), Quantity.parse(row.quantity));
  }
  throw new TypeError("Invalid exact line source mode or operands");
}

export function derivedPrice(total: Money, quantity: Quantity): Readonly<{
  source: Readonly<{ total: string; quantity: string }>;
  line: (quantity: Quantity) => ExactLine;
}> {
  positiveQuantity(quantity);
  return Object.freeze({
    source: Object.freeze({ total: total.toWire(), quantity: quantity.toWire() }),
    line: (next: Quantity) => ExactLine.fromDerived(total, quantity, next),
  });
}

/** Finalize the whole document, nearest with exact ties away from zero. */
export function finalizeLines(lines: readonly ExactLine[]): Money {
  boundedItems(lines.length);
  let total = fraction(0n, 1n);
  for (const line of lines) {
    const value = lineValues.get(line);
    if (!value) throw new TypeError("Expected an exact source line");
    const shared = gcd(total.denominator, value.denominator);
    const left = value.denominator / shared;
    const right = total.denominator / shared;
    total = fraction(limited(total.numerator * left + value.numerator * right), limited(total.denominator * left));
  }
  const sign = total.numerator < 0n ? -1n : 1n;
  const magnitude = total.numerator * sign;
  const rounded = magnitude / total.denominator + (2n * (magnitude % total.denominator) >= total.denominator ? 1n : 0n);
  return Money.fromMinorUnits((sign * rounded).toString());
}

/** Reports may sum wider than persisted int64, without passing through SQL SUM or Number. */
export function sumMoney(amounts: readonly Money[]): string {
  boundedItems(amounts.length);
  let total = 0n;
  for (const amount of amounts) {
    currency(amount.currency);
    total += BigInt(amount.toMinorUnits());
  }
  return render(total, 2);
}

export type RecordedAllocation = Readonly<{ id: string; amount: Money }>;
export function allocateMoney(target: Money, shares: readonly Readonly<{ id: string; weight: string }>[]): readonly RecordedAllocation[] {
  currency(target.currency);
  boundedItems(shares.length);
  if (!shares.length) throw new RangeError("Allocation requires recorded shares");
  const ids = new Set<string>();
  const weights = shares.map(share => {
    if (typeof share.id !== "string" || !share.id.length || share.id.length > 128 || ids.has(share.id)) throw new TypeError("Allocation requires unique recorded identities");
    ids.add(share.id);
    const weight = decimal(share.weight, 18);
    if (weight < 0n) throw new RangeError("Allocation weights must be nonnegative");
    return weight;
  });
  const denominator = weights.reduce((a, b) => a + b, 0n);
  if (denominator === 0n) throw new RangeError("Allocation weight sum must be positive");
  const signed = BigInt(target.toMinorUnits());
  const sign = signed < 0n ? -1n : 1n;
  const magnitude = signed * sign;
  const rows = shares.map((share, index) => ({
    id: share.id, index, units: magnitude * weights[index]! / denominator,
    remainder: magnitude * weights[index]! % denominator,
  }));
  let remaining = magnitude - rows.reduce((a, b) => a + b.units, 0n);
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) {
    if (remaining === 0n) break;
    row.units += 1n;
    remaining -= 1n;
  }
  return Object.freeze(rows.map(row => Object.freeze({ id: row.id, amount: Money.fromMinorUnits((sign * row.units).toString()) })));
}
export function reverseAllocations(recorded: readonly RecordedAllocation[]): readonly RecordedAllocation[] {
  boundedItems(recorded.length);
  return Object.freeze(recorded.map(row => Object.freeze({ id: row.id, amount: row.amount.negate() })));
}
