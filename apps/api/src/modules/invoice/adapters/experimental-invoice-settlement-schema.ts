import { exactInvoiceSchemaStatements } from "./exact-invoice-schema";

const minor = (column: string, positive = false) => `"${column}" INTEGER NOT NULL CHECK(typeof("${column}")='integer' AND "${column}" BETWEEN ${positive ? 1 : 0} AND 9223372036854775807)`;

const markerCreate = "CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)";
const markerInsert = "INSERT INTO exact_money_schema VALUES ('invoice',1)";
const invoiceCreate = exactInvoiceSchemaStatements.find(statement => statement.startsWith("CREATE TABLE invoice ("));
if (!invoiceCreate) throw new Error("Exact invoice DDL anchor missing");
if (!exactInvoiceSchemaStatements.includes(markerCreate) || !exactInvoiceSchemaStatements.includes(markerInsert)) {
  throw new Error("Exact invoice marker DDL anchor missing");
}

function replaceExactlyOnce(source: string, before: string, after: string, name: string): string {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) throw new Error(`Experimental invoice DDL anchor must occur once: ${name}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let experimentalInvoiceCreate = invoiceCreate;
experimentalInvoiceCreate = replaceExactlyOnce(experimentalInvoiceCreate, "status TEXT NOT NULL CHECK(status IN ('DRAFT','RECEIVED','PAID','VOIDED'))", "status TEXT NOT NULL CHECK(status IN ('DRAFT','RECEIVED','SETTLED','PAID','VOIDED'))", "status constraint");
experimentalInvoiceCreate = replaceExactlyOnce(experimentalInvoiceCreate, `${minor("paid_amount_minor")}, ${minor("remaining_amount_minor")}`, `${minor("paid_amount_minor")}, ${minor("settled_amount_minor")}, ${minor("remaining_amount_minor")}`, "money columns");
experimentalInvoiceCreate = replaceExactlyOnce(experimentalInvoiceCreate, "CHECK(status='VOIDED' OR total_amount_minor=paid_amount_minor+remaining_amount_minor)", "CHECK(status='VOIDED' OR total_amount_minor=paid_amount_minor+settled_amount_minor+remaining_amount_minor)", "amount constraint");

/** Inert experimental DDL. No initializer imports or selects this statement list. */
export const experimentalInvoiceSettlementSchemaStatements: readonly string[] = exactInvoiceSchemaStatements.map(statement => {
  if (statement === markerInsert) return "INSERT INTO exact_money_schema VALUES ('invoice_experimental_settlement',2)";
  if (statement === invoiceCreate) return experimentalInvoiceCreate;
  return statement;
});
