import type { DbExecutor } from "./schema";
import type { BetterSqliteDatabase } from "../../types/sqlite";

export type ExactMoneySlice = "debt" | "expenses";
const ACTIVATION_REQUIRED = "Exact money requires coordinated schema, reader, writer and contract activation; legacy startup is disabled for this database";

/** Reject converted copies before legacy initialization or financial composition. */
export async function assertLegacyMoneySchema(db: DbExecutor): Promise<void> {
  const markers = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE lower(name) = 'exact_money_schema'",
  );
  if (markers.length) throw new Error(ACTIVATION_REQUIRED);

  const legacyMoneyColumns = {
    debt_account: ["current_balance", "current_balance_dzd"],
    debt_entry: ["signed_amount", "balance_after", "signed_amount_dzd", "balance_after_dzd"],
    expense: ["amount_dzd"],
    expense_revision: ["previous_amount_dzd", "new_amount_dzd"],
  } as const;
  for (const [table, legacyNames] of Object.entries(legacyMoneyColumns)) {
    const columns = await db.$queryRawUnsafe<{ name: string; type: string }[]>(`PRAGMA table_xinfo("${table}")`);
    for (const column of columns) {
      const name = column.name.toLowerCase();
      const isLegacyMoney = (legacyNames as readonly string[]).includes(name);
      if (name.endsWith("_minor") || (isLegacyMoney && column.type.toUpperCase() !== "REAL")) {
        throw new Error(ACTIVATION_REQUIRED);
      }
    }
  }
}

/** Opt-in adapter prerequisite only. Adapters must also validate their physical columns. */
export function requireExactMoneySchema(db: BetterSqliteDatabase, slice: ExactMoneySlice): void {
  if (slice !== "debt" && slice !== "expenses") throw new TypeError("Unknown exact money slice");
  const marker = db.prepare("SELECT type FROM sqlite_master WHERE lower(name) = 'exact_money_schema'").get() as { type: string } | undefined;
  if (marker?.type !== "table") throw new Error("Exact money schema marker is required");
  const columns = db.pragma("table_info(exact_money_schema)") as { name: string; type: string; pk: number; notnull: number }[];
  const identity = columns.find(column => column.name === "slice");
  const version = columns.find(column => column.name === "version");
  if (columns.length !== 2 || identity?.type.toUpperCase() !== "TEXT" || identity.pk !== 1
    || version?.type.toUpperCase() !== "INTEGER" || version.notnull !== 1 || version.pk !== 0) {
    throw new Error("Malformed exact money schema marker");
  }
  const row = db.prepare("SELECT version FROM exact_money_schema WHERE slice = ?").get(slice) as { version: unknown } | undefined;
  if (row?.version !== 1) throw new Error("Exact money schema version 1 is required for this slice");
}
