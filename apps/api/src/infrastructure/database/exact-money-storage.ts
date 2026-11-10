import { Money, UnitPrice } from "@tuari/contracts";
import type { BetterSqliteDatabase } from "../../types/sqlite";

/** Opt-in native binds only. No existing schema or repository uses this capability. */
export function bindMoney(amount: Money): bigint {
  return BigInt(Money.fromMinorUnits(amount.toMinorUnits(), amount.currency).toMinorUnits());
}
export function bindUnitPrice(price: UnitPrice): bigint {
  return BigInt(UnitPrice.parse(price.toWire()).toScaledUnits());
}

type ExactRead<T> = Readonly<{
  get: (...parameters: unknown[]) => T | null | undefined;
  all: (...parameters: unknown[]) => readonly (T | null)[];
}>;

/**
 * Isolate the money projection. Other integer columns cannot accidentally leak as BigInt.
 * Callers keep IDs/counts/timestamps in their ordinary projections. Parameter binding stays
 * on the factory proxy, because chaining safeIntegers returns the underlying native statement.
 */
function prepareExactRead<T>(db: BetterSqliteDatabase, sql: string, alias: string, decode: (units: bigint) => T): ExactRead<T> {
  const statement = db.prepare(sql);
  const columns = statement.columns();
  if (columns.length !== 1 || columns[0]?.name !== alias) {
    throw new TypeError(`Exact money projection must select only ${alias}`);
  }
  statement.safeIntegers(true);
  const rowValue = (row: unknown): T | null => {
    const value = (row as Record<string, unknown>)[alias];
    if (value === null) return null;
    if (typeof value !== "bigint") throw new TypeError("Exact money requires a native integer column, not REAL/TEXT");
    return decode(value);
  };
  return Object.freeze({
    get: (...parameters: unknown[]) => {
      const row = statement.get(...parameters);
      return row === undefined ? undefined : rowValue(row);
    },
    all: (...parameters: unknown[]) => statement.all(...parameters).map(rowValue),
  });
}
export function prepareMoneyRead(db: BetterSqliteDatabase, sql: string): ExactRead<Money> {
  return prepareExactRead(db, sql, "minor_units", units => Money.fromMinorUnits(units.toString()));
}
export function prepareUnitPriceRead(db: BetterSqliteDatabase, sql: string): ExactRead<UnitPrice> {
  return prepareExactRead(db, sql, "scaled_units", units => UnitPrice.fromScaledUnits(units.toString()));
}
