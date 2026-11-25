import { expenseAttachmentSchema, expenseAttachmentOwnerIndex } from "../../modules/expenses/expense-attachments";
import { exactDebtSchemaStatements } from "../../modules/company/adapters/exact-finance-schema";
import { exactInvoiceSchemaStatements } from "../../modules/invoice/adapters/exact-invoice-schema";
import { exactInventorySchemaStatements } from "../../modules/inventory/adapters/exact-inventory-schema";
import { exactExpenseSchemaStatements } from "../../modules/expenses/expenses.exact-schema";
import { payrollCashSchemaStatements } from "../../modules/workforce/adapters/payroll-cash-schema";
import { payrollOffsetSchemaStatements } from "../../modules/workforce/adapters/payroll-offset-schema";
import { schemaStatements } from "./schema-definitions";
import { payrollOpeningSchemaStatements } from "../../modules/workforce/adapters/sqlite-payroll-opening.repository";

const retiredTables = new Set(["employee_salary_payment", "employee_salary_payment_split"]);
const marker = /^CREATE TABLE IF NOT EXISTS exact_money_schema\b/i;
const markerInsert = /^INSERT INTO exact_money_schema\b/i;
const createTable = /^CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?(\w+)["`]?/i;
const createIndex = /^CREATE\s+(?:UNIQUE\s+)?INDEX(?: IF NOT EXISTS)?\s+[^\s]+\s+ON\s+["`]?(\w+)["`]?/i;
const createTrigger = /^CREATE TRIGGER(?: IF NOT EXISTS)?\s+[^\s]+\s+(?:BEFORE|AFTER|INSTEAD OF)\s+\w+\s+ON\s+["`]?(\w+)["`]?/i;

function tableCreatedBy(statement: string): string | undefined {
  return createTable.exec(statement)?.[1]?.toLowerCase();
}

function targetTable(statement: string): string | undefined {
  return createIndex.exec(statement)?.[1]?.toLowerCase()
    ?? createTrigger.exec(statement)?.[1]?.toLowerCase();
}

function requireSupportedBaseStatement(statement: string): void {
  if (tableCreatedBy(statement) || targetTable(statement)) return;
  throw new Error(`Unsupported schemaStatements DDL in fresh exact plan: ${statement.slice(0, 100)}`);
}

const exactSlices = [
  exactDebtSchemaStatements,
  exactInvoiceSchemaStatements,
  exactInventorySchemaStatements,
  exactExpenseSchemaStatements,
  payrollCashSchemaStatements,
  payrollOffsetSchemaStatements,
] as const;

const exactOwnedTables = new Set<string>();
for (const statements of exactSlices) {
  for (const statement of statements) {
    const table = tableCreatedBy(statement);
    if (table) exactOwnedTables.add(table);
  }
}

const baseTables = new Map<string, string>();
const baseTableNames = new Set<string>();
const baseIndexesAndTriggers: string[] = [];
for (const statement of schemaStatements) {
  if (marker.test(statement) || markerInsert.test(statement)) continue;
  requireSupportedBaseStatement(statement);
  const table = tableCreatedBy(statement);
  if (table) {
    if (baseTableNames.has(table)) throw new Error(`Duplicate base table DDL for ${table}`);
    baseTableNames.add(table);
    if (retiredTables.has(table) || exactOwnedTables.has(table)) continue;
    baseTables.set(table, statement);
    continue;
  }
  const target = targetTable(statement);
  if (!target) throw new Error(`Could not identify target table in base DDL: ${statement.slice(0, 100)}`);
  if (!retiredTables.has(target) && !exactOwnedTables.has(target)) baseIndexesAndTriggers.push(statement);
}

/** Accepted #558 baseline, retained for exact physical attestation before upgrade. */
export const freshExactSchemaPlanV1: readonly string[] = Object.freeze([
  ...baseTables.values(),
  ...baseIndexesAndTriggers,
  "CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)",
  ...exactSlices.flatMap((statements) => statements.filter((statement) => !marker.test(statement) && !markerInsert.test(statement))),
  ...exactSlices.flatMap((statements) => statements.filter((statement) => markerInsert.test(statement))),
  "INSERT INTO exact_money_schema(slice,version) VALUES ('workforce',1)",
]);

/** Additive opening provenance does not rewrite accepted #558 financial history. */
export const freshExactSchemaPlanBeforeReceipts: readonly string[] = Object.freeze([
  ...freshExactSchemaPlanV1, ...payrollOpeningSchemaStatements,
]);
/** Receipt graph shipped before the owner-order index, retained for exact attestation. */
export const freshExactSchemaPlanBeforeReceiptIndex: readonly string[] = Object.freeze([
  ...freshExactSchemaPlanBeforeReceipts, expenseAttachmentSchema,
]);
export const freshExactSchemaPlan: readonly string[] = Object.freeze([
  ...freshExactSchemaPlanBeforeReceiptIndex, expenseAttachmentOwnerIndex,
]);

/** Ownership record for plan consumers and focused composition tests. */
export const freshExactSchemaOwnership = Object.freeze({
  replacedBaseTables: Object.freeze([...exactOwnedTables].filter((table) => baseTableNames.has(table)).sort()),
  retiredLegacyTables: Object.freeze([...retiredTables].sort()),
  exactTables: Object.freeze([...exactOwnedTables, ...payrollOpeningSchemaStatements.map(tableCreatedBy).filter((table): table is string => table !== undefined)].sort()),
});
