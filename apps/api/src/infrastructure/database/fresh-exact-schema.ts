import { createDatabaseConnection } from "./factory";
import { expenseAttachmentSchema } from "../../modules/expenses/expense-attachments";
import { freshExactSchemaPlan, freshExactSchemaPlanV1, freshExactSchemaPlanBeforeReceipts } from "./fresh-exact-schema-plan";
import { payrollOpeningSchemaStatements } from "../../modules/workforce/adapters/sqlite-payroll-opening.repository";
import { ensureFreshApplicationIdentity } from "./schema";
import { BetterSqlite3Executor } from "./sqlite-executor";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const startupKey = "fresh_exact_financial_v1";
const slices = ["debt", "expenses", "inventory", "invoice", "workforce"];
const unsupported = () => new Error("Unsupported financial schema: a fresh or fully attested exact application database is required");

type SchemaRow = { type: string; name: string; tbl_name: string; sql: string | null };
function physicalSchema(db: BetterSqliteDatabase): SchemaRow[] {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as SchemaRow[];
}

const openingKey = "payroll_opening_v1";
async function construct(db: BetterSqliteDatabase, opening = true, receipts = true) {
  for (const statement of opening ? receipts ? freshExactSchemaPlan : freshExactSchemaPlanBeforeReceipts : freshExactSchemaPlanV1) db.exec(statement);
  await ensureFreshApplicationIdentity(new BetterSqlite3Executor(db));
  db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run(startupKey, new Date().toISOString());
  if (opening) db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run(openingKey, new Date().toISOString());
}

/** A disposable schema oracle holds no application data or financial services. */
async function expectedSchema(opening = true, receipts = true): Promise<SchemaRow[]> {
  const reference = createDatabaseConnection(":memory:", "");
  try {
    await construct(reference, opening, receipts);
    return physicalSchema(reference);
  } finally { reference.close(); }
}

function attest(db: BetterSqliteDatabase, expected: SchemaRow[]) {
  if (JSON.stringify(physicalSchema(db)) !== JSON.stringify(expected)) throw unsupported();
  const markers = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
  if (JSON.stringify(markers) !== JSON.stringify(slices.map(slice => ({ slice, version: 1 })))) throw unsupported();
  if (!db.prepare("SELECT key FROM app_schema_state WHERE key=?").get(startupKey)) throw unsupported();
  if ((db.pragma("foreign_key_check") as unknown[]).length) throw unsupported();
}

/** Select the complete fresh schema before constructing any financial writer. */
export async function ensureFreshExactApplicationSchema(db: BetterSqliteDatabase): Promise<void> {
  if (db.inTransaction) throw new Error("Financial schema startup requires its own transaction");
  const expected = await expectedSchema();
  const previous = await expectedSchema(false);
  const beforeReceipts = await expectedSchema(true, false);
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (physicalSchema(db).length === 0) await construct(db);
    else if (JSON.stringify(physicalSchema(db)) === JSON.stringify(previous)) {
      attest(db, previous);
      if (db.prepare("SELECT key FROM app_schema_state WHERE key=?").get(openingKey)) throw unsupported();
      for (const statement of payrollOpeningSchemaStatements) db.exec(statement);
      db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run(openingKey, new Date().toISOString());
    }
    if (JSON.stringify(physicalSchema(db)) === JSON.stringify(beforeReceipts)) {
      attest(db, beforeReceipts);
      db.exec(expenseAttachmentSchema);
    }
    attest(db, expected);
    if (!db.prepare("SELECT key FROM app_schema_state WHERE key=?").get(openingKey)) throw unsupported();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
