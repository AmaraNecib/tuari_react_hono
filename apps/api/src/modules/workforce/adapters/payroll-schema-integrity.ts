import type { BetterSqliteDatabase } from "../../../types/sqlite";

/** Caller holds the shared transaction while attesting the owned preparation. */
export function assertPreparedPayrollSchema(db: BetterSqliteDatabase, statements: readonly string[]): void {
  if (db.pragma("foreign_keys", { simple: true }) !== 1) throw new TypeError("Payroll foreign keys must be enabled");
  const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();
  for (const statement of statements) {
    const object = /^CREATE (TABLE|INDEX|TRIGGER) (\w+)/.exec(statement);
    if (!object) throw new TypeError("Unsupported payroll schema statement");
    const installed = db.prepare("SELECT sql FROM sqlite_master WHERE type=? AND name=?").get(object[1]!.toLowerCase(), object[2]!) as { sql: string | null } | undefined;
    if (!installed?.sql || normalize(installed.sql) !== normalize(statement)) throw new TypeError(`Incompatible prepared payroll schema: ${object[2]}`);
  }
}
