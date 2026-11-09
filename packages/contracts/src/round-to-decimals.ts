/**
 * Round to the precision used by money or inventory, half away from zero.
 *
 * Scale the decimal string, not its binary product, so 1.005 becomes 100.5
 * at two decimals. Scientific notation falls back to the binary product.
 * Non-finite inputs and overflowing scales return the original value.
 *
 * This calculation preserves signed zero. Callers own zero normalization,
 * already-aligned grid checks and any historical fallback policy.
 */
export function roundToDecimals(value: number, decimals: 2 | 6): number {
  if (!Number.isFinite(value)) return value;

  const scale = 10 ** decimals;
  const scaled = Number(`${value}e${decimals}`);
  const units = Number.isFinite(scaled) ? scaled : value * scale;
  if (!Number.isFinite(units)) return value;

  return (Math.sign(units) * Math.round(Math.abs(units))) / scale;
}
