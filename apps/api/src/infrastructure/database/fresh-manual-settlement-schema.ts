import { createDatabaseConnection } from "./factory";
import { expenseAttachmentSchema, expenseAttachmentOwnerIndex } from "../../modules/expenses/expense-attachments";
import { freshExactSchemaPlan, freshExactSchemaPlanBeforeReceipts } from "./fresh-exact-schema-plan";
import { manualSettlementSchemaStatements } from "../../modules/company/adapters/manual-settlement-schema";
import { ensureFreshApplicationIdentity } from "./schema";
import { BetterSqlite3Executor } from "./sqlite-executor";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const keys = ["fresh_exact_financial_v1", "payroll_opening_v1", "manual_debt_settlement_v1"];
const physical = (db: BetterSqliteDatabase) => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
const markers = (db: BetterSqliteDatabase) => db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
const unsupported = () => new Error("Unsupported manual settlement schema: a fresh disposable or fully attested settlement application database is required");
async function construct(db: BetterSqliteDatabase, receipts = true) {
  for (const statement of [...(receipts ? freshExactSchemaPlan : freshExactSchemaPlanBeforeReceipts), ...manualSettlementSchemaStatements]) db.exec(statement);
  db.exec("INSERT INTO exact_money_schema(slice,version) VALUES ('manual_settlement',1)");
  await ensureFreshApplicationIdentity(new BetterSqlite3Executor(db));
  for (const key of keys) db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run(key, new Date().toISOString());
}

/** Explicit disposable-data opt-in. Only receipt metadata upgrades an attested older graph. */
export async function ensureFreshManualSettlementApplicationSchema(db: BetterSqliteDatabase): Promise<void> {
  if (db.inTransaction) throw new Error("Manual settlement startup requires its own transaction");
  const oracle = createDatabaseConnection(":memory:", "");
  let expectedSchema: string;
  let expectedMarkers: string;
  let previousSchema: string;
  let beforeIndex: string;
  try {
    await construct(oracle, false);
    previousSchema = JSON.stringify(physical(oracle));
    oracle.exec(expenseAttachmentSchema);
    beforeIndex = JSON.stringify(physical(oracle));
    oracle.exec(expenseAttachmentOwnerIndex);
    expectedSchema = JSON.stringify(physical(oracle));
    expectedMarkers = JSON.stringify(markers(oracle));
  } finally { oracle.close(); }
  db.pragma("foreign_keys=ON");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (physical(db).length === 0) await construct(db);
    if (JSON.stringify(physical(db)) === previousSchema) {
      if (JSON.stringify(markers(db)) !== expectedMarkers) throw unsupported();
      for (const key of keys) if (!db.prepare("SELECT key FROM app_schema_state WHERE key=?").get(key)) throw unsupported();
      db.exec(expenseAttachmentSchema);
    }
    if (JSON.stringify(physical(db)) === beforeIndex) {
      if (JSON.stringify(markers(db)) !== expectedMarkers) throw unsupported();
      for (const key of keys) if (!db.prepare("SELECT key FROM app_schema_state WHERE key=?").get(key)) throw unsupported();
      db.exec(expenseAttachmentOwnerIndex);
    }
    if (JSON.stringify(physical(db)) !== expectedSchema) throw unsupported();
    if (JSON.stringify(markers(db)) !== expectedMarkers) throw unsupported();
    for (const key of keys) if (!db.prepare("SELECT key FROM app_schema_state WHERE key=?").get(key)) throw unsupported();
    if ((db.pragma("foreign_key_check") as unknown[]).length) throw unsupported();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
