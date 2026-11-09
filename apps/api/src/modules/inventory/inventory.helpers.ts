/**
 * Pure helpers for inventory write paths.
 *
 * Requests use a six-decimal quantum. Balance changes use decimal arithmetic
 * and validate the resulting Number delta before writing stock.
 */

/**
 * Decimal places a consumable quantity is normalised to. Fine enough to survive
 * any quantity an operator can type and coarse enough to absorb the noise at
 * inventory magnitudes.
 */
export const QUANTITY_DECIMALS = 6;

const QUANTITY_SCALE = 10 ** QUANTITY_DECIMALS;

/**
 * The smallest representable balance. A quantity below this rounds to zero, so
 * both the picker's availability predicate and the write gate treat any row
 * smaller than it as empty — one bound, evaluated in SQL and in JS.
 */
export const QUANTITY_MIN = 1 / QUANTITY_SCALE;

/** Decimal coefficient and fractional-digit count from a Number's decimal form. */
type DecimalQuantity = { coefficient: bigint; scale: number }

function parseDecimalQuantity(value: number): DecimalQuantity | null {
  if (!Number.isFinite(value)) return null

  const match = /^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value))
  if (!match) return null

  const [, sign, integerPart, fractionalPart = "", exponentText] = match
  if (integerPart === undefined) return null

  const exponent = exponentText === undefined ? 0 : Number(exponentText)
  const digits = BigInt(`${integerPart}${fractionalPart}`)
  const scale = fractionalPart.length - exponent
  const signedDigits = sign === "-" ? -digits : digits

  return scale >= 0
    ? { coefficient: signedDigits, scale }
    : { coefficient: signedDigits * 10n ** BigInt(-scale), scale: 0 }
}

function alignDecimalQuantity(value: DecimalQuantity, scale: number): bigint {
  return value.coefficient * 10n ** BigInt(scale - value.scale)
}

function decimalQuantityToNumber(value: DecimalQuantity): number {
  const negative = value.coefficient < 0n
  const digits = (negative ? -value.coefficient : value.coefficient).toString()
  const padded = digits.padStart(value.scale + 1, "0")
  const whole = value.scale === 0 ? padded : padded.slice(0, -value.scale)
  const fraction = value.scale === 0 ? "" : padded.slice(-value.scale).replace(/0+$/, "")
  return Number(`${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`)
}

/**
 * Convert a normalized quantity to exact micro-units from its decimal Number
 * form. Values that do not represent whole micro-units are rejected.
 */
export function normalizedQuantityMicroUnits(value: number): bigint | null {
  const decimal = parseDecimalQuantity(value)
  if (!decimal) return null

  const scaleAdjustment = QUANTITY_DECIMALS - decimal.scale
  if (scaleAdjustment >= 0) return decimal.coefficient * 10n ** BigInt(scaleAdjustment)

  const divisor = 10n ** BigInt(-scaleAdjustment)
  if (decimal.coefficient % divisor !== 0n) return null
  return decimal.coefficient / divisor
}

/** Add decimal quantities without routing the calculation through binary sums. */
export function addQuantity(left: number, right: number): number {
  const leftDecimal = parseDecimalQuantity(left)
  const rightDecimal = parseDecimalQuantity(right)
  if (!leftDecimal || !rightDecimal) return left + right

  const scale = Math.max(leftDecimal.scale, rightDecimal.scale)
  return decimalQuantityToNumber({
    coefficient: alignDecimalQuantity(leftDecimal, scale) + alignDecimalQuantity(rightDecimal, scale),
    scale,
  })
}

/** Subtract decimal quantities without routing the calculation through binary differences. */
export function subtractQuantity(left: number, right: number): number {
  const leftDecimal = parseDecimalQuantity(left)
  const rightDecimal = parseDecimalQuantity(right)
  if (!leftDecimal || !rightDecimal) return left - right

  const scale = Math.max(leftDecimal.scale, rightDecimal.scale)
  return decimalQuantityToNumber({
    coefficient: alignDecimalQuantity(leftDecimal, scale) - alignDecimalQuantity(rightDecimal, scale),
    scale,
  })
}

/**
 * Check both the decimal balance delta and its actual Number delta at the storage
 * quantum. The second check rejects changes that float spacing rounds to a
 * different number of micro-units.
 */
export function quantityDifferenceMatches(before: number, after: number, expected: number): boolean {
  const beforeDecimal = parseDecimalQuantity(before)
  const afterDecimal = parseDecimalQuantity(after)
  const expectedDecimal = parseDecimalQuantity(expected)
  if (!beforeDecimal || !afterDecimal || !expectedDecimal) return false

  const scale = Math.max(beforeDecimal.scale, afterDecimal.scale, expectedDecimal.scale)
  const decimalDifference = alignDecimalQuantity(beforeDecimal, scale) - alignDecimalQuantity(afterDecimal, scale)
  if (decimalDifference !== alignDecimalQuantity(expectedDecimal, scale)) return false

  const actualUnits = normalizedQuantityMicroUnits(roundQuantity(before - after))
  const expectedUnits = normalizedQuantityMicroUnits(roundQuantity(expected))
  return actualUnits !== null && expectedUnits !== null && actualUnits === expectedUnits
}

/**
 * Round a consumable quantity to {@link QUANTITY_DECIMALS} decimals, half away
 * from zero. Values already on that decimal grid stay unchanged; rounding them
 * through a scaled float can alter large stored balances. Use decimal addition
 * or subtraction for balance changes instead.
 *
 * Scales the decimal representation rather than the binary product, mirroring
 * `roundMoneyToCents`: `${v}e6` is read as an exact decimal, so `0.7999999999999999`
 * becomes `0.8` instead of dragging a float epsilon through to storage. A value
 * whose string form is exponential falls back to the float product; a magnitude
 * whose scale would overflow is returned unchanged rather than `Infinity`.
 */
export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  if (value === 0) return 0
  if (normalizedQuantityMicroUnits(value) !== null) return value

  const scaled = Number(`${value}e${QUANTITY_DECIMALS}`);
  const units = Number.isFinite(scaled) ? scaled : value * QUANTITY_SCALE;
  if (!Number.isFinite(units)) {
    return value;
  }

  const result = (Math.sign(units) * Math.round(Math.abs(units))) / QUANTITY_SCALE;
  // Normalise -0 so a value rounded away from nothing compares equal to 0.
  return result === 0 ? 0 : result;
}
