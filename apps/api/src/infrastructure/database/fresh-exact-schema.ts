import { createDatabaseConnection } from "./factory";
import { freshExactSchemaPlan } from "./fresh-exact-schema-plan";
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

async function construct(db: BetterSqliteDatabase) {
  for (const statement of freshExactSchemaPlan) db.exec(statement);
  await ensureFreshApplicationIdentity(new BetterSqlite3Executor(db));
  db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run(startupKey, new Date().toISOString());
}

/** A disposable schema oracle holds no application data or financial services. */
async function expectedSchema(): Promise<SchemaRow[]> {
  const reference = createDatabaseConnection(":memory:", "");
  try {
    await construct(reference);
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
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (physicalSchema(db).length === 0) await construct(db);
    attest(db, expected);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
