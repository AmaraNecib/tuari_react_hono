/**
 * Pure helpers for the inventory write paths.
 *
 * Consumable quantities are fractional (kg, litres, pieces), so unlike money
 * they have no fixed currency scale. They still need ONE rounding rule: a sum
 * or difference of stored balances carries IEEE-754 noise (`0.7 + 0.1` is
 * `0.7999999999999999`), which makes an exact availability check reject a valid
 * request and leaves a residual that the picker's availability predicate still
 * offers as stock.
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

/**
 * Round a consumable quantity to {@link QUANTITY_DECIMALS} decimals, half away
 * from zero.
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

  const scaled = Number(`${value}e${QUANTITY_DECIMALS}`);
  const units = Number.isFinite(scaled) ? scaled : value * QUANTITY_SCALE;
  if (!Number.isFinite(units)) {
    return value;
  }

  const result = (Math.sign(units) * Math.round(Math.abs(units))) / QUANTITY_SCALE;
  // Normalise -0 so a value rounded away from nothing compares equal to 0.
  return result === 0 ? 0 : result;
}
