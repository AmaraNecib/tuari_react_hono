import { createDatabaseConnection } from "./factory";
import { freshExactSchemaPlan } from "./fresh-exact-schema-plan";
import { exactInvoiceSchemaStatements } from "../../modules/invoice/adapters/exact-invoice-schema";
import { experimentalInvoiceSettlementSchemaStatements } from "../../modules/invoice/adapters/experimental-invoice-settlement-schema";
import { manualSettlementSchemaStatements } from "../../modules/company/adapters/manual-settlement-schema";
import { expenseAttachmentSchema, expenseAttachmentOwnerIndex } from "../../modules/expenses/expense-attachments";
import { ensureFreshApplicationIdentity } from "./schema";
import { BetterSqlite3Executor } from "./sqlite-executor";
import type { BetterSqliteDatabase } from "../../types/sqlite";

const appKey = "fresh_experimental_invoice_settlement_v2";
const startupKeys = ["fresh_exact_financial_v1", "payroll_opening_v1", "manual_debt_settlement_v1", appKey];
const physical = (db: BetterSqliteDatabase) => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
const markers = (db: BetterSqliteDatabase) => db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all();
const refuse = () => new Error("Unsupported experimental invoice settlement schema: fresh or fully attested experimental database required");

function experimentalPlan(): string[] {
  const sourceInvoice = exactInvoiceSchemaStatements.find(statement => statement.startsWith("CREATE TABLE invoice ("));
  const experimentalInvoice = experimentalInvoiceSettlementSchemaStatements.find(statement => statement.startsWith("CREATE TABLE invoice ("));
  const sourceMarker = "INSERT INTO exact_money_schema VALUES ('invoice',1)";
  const experimentalMarker = "INSERT INTO exact_money_schema VALUES ('invoice_experimental_settlement',2)";
  if (!sourceInvoice || !experimentalInvoice || !exactInvoiceSchemaStatements.includes(sourceMarker) || !experimentalInvoiceSettlementSchemaStatements.includes(experimentalMarker)) throw new Error("Experimental invoice schema anchors changed");
  const sourceStatements = new Set(exactInvoiceSchemaStatements.filter(statement => statement !== "CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)"));
  const plan = freshExactSchemaPlan.map(statement => {
    if (statement === sourceInvoice) return experimentalInvoice;
    if (statement === sourceMarker) return experimentalMarker;
    return statement;
  });
  if (!plan.includes(experimentalInvoice) || !plan.includes(experimentalMarker) || plan.some(statement => sourceStatements.has(statement) && (statement === sourceInvoice || statement === sourceMarker))) throw new Error("Experimental invoice plan substitution failed");
  plan.push(...manualSettlementSchemaStatements, "INSERT INTO exact_money_schema(slice,version) VALUES ('manual_settlement',1)", expenseAttachmentSchema, expenseAttachmentOwnerIndex);
  return plan;
}

async function construct(db: BetterSqliteDatabase, plan: readonly string[]) {
  for (const statement of plan) db.exec(statement);
  await ensureFreshApplicationIdentity(new BetterSqlite3Executor(db));
  for (const key of startupKeys) db.prepare("INSERT INTO app_schema_state(key,executed_at) VALUES (?,?)").run(key, new Date().toISOString());
}

export async function ensureFreshExperimentalInvoiceSettlementSchema(db: BetterSqliteDatabase): Promise<void> {
  if (db.inTransaction) throw new Error("Experimental schema startup requires its own transaction");
  const oracle = createDatabaseConnection(":memory:", "", { journalMode: "preserve" });
  let expected: string;
  let expectedMarkers: string;
  let expectedApp: string;
  const plan = experimentalPlan();
  try {
    await construct(oracle, plan);
    expected = JSON.stringify(physical(oracle));
    expectedMarkers = JSON.stringify(markers(oracle));
    expectedApp = JSON.stringify(oracle.prepare("SELECT key FROM app_schema_state ORDER BY key").all());
  } finally { oracle.close(); }
  db.pragma("foreign_keys=ON");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (physical(db).length === 0) await construct(db, plan);
    if (JSON.stringify(physical(db)) !== expected || JSON.stringify(markers(db)) !== expectedMarkers || JSON.stringify(db.prepare("SELECT key FROM app_schema_state ORDER BY key").all()) !== expectedApp || (db.pragma("foreign_key_check") as unknown[]).length) throw refuse();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
