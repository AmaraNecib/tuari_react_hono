import { normalizedQuantityMicroUnits } from "./inventory.helpers";

/** Convert only an independent normalized stock quantity, never money. */
export function exactInventoryQuantityText(value: number): string {
  const units = normalizedQuantityMicroUnits(value);
  if (units === null || units <= 0n) throw new RangeError("Expected positive normalized inventory quantity");
  const digits = units.toString().padStart(7, "0");
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`.replace(/\.?0+$/, "");
}
