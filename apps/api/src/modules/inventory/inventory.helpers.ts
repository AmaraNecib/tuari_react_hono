/**
 * Pure helpers for the inventory write paths.
 *
 * Consumable quantities are fractional (kg, litres, pieces), so unlike money
 * they have no fixed currency scale. They still need ONE rounding rule: a sum
 * or difference of stored balances carries IEEE-754 noise (`0.7 + 0.1` is
 * `0.7999999999999999`), which makes an exact availability check reject a valid
 * request and leaves a residual that the picker's `quantity > 0` predicate still
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
 * Round a consumable quantity to {@link QUANTITY_DECIMALS} decimals, half away
 * from zero.
 *
 * Scales the decimal representation rather than the binary product, mirroring
 * `roundMoneyToCents`: `${v}e6` is read as an exact decimal, so `0.7999999999999999`
 * becomes `0.8` instead of dragging a float epsilon through to storage. A value
 * whose string form is exponential falls back to the float product, which is
 * exact enough at that magnitude.
 */
export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const scaled = Number(`${value}e${QUANTITY_DECIMALS}`);
  if (!Number.isFinite(scaled)) {
    // Exponential string form (the fallback also keeps a magnitude whose *scale*
    // overflows from turning into Infinity).
    const product = value * QUANTITY_SCALE;
    return Number.isFinite(product) ? Math.round(product) / QUANTITY_SCALE : value;
  }

  return (Math.sign(scaled) * Math.round(Math.abs(scaled))) / QUANTITY_SCALE;
}
