import { exactInvoiceSchemaStatements } from "./exact-invoice-schema";

const minor = (column: string, positive = false) => `"${column}" INTEGER NOT NULL CHECK(typeof("${column}")='integer' AND "${column}" BETWEEN ${positive ? 1 : 0} AND 9223372036854775807)`;

const markerCreate = "CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)";
const markerInsert = "INSERT INTO exact_money_schema VALUES ('invoice',1)";
const invoiceCreate = exactInvoiceSchemaStatements.find(statement => statement.startsWith("CREATE TABLE invoice ("));
if (!invoiceCreate) throw new Error("Exact invoice DDL anchor missing");
if (!exactInvoiceSchemaStatements.includes(markerCreate) || !exactInvoiceSchemaStatements.includes(markerInsert)) {
  throw new Error("Exact invoice marker DDL anchor missing");
}

const experimentalInvoiceCreate = invoiceCreate
  .replace("status TEXT NOT NULL CHECK(status IN ('DRAFT','RECEIVED','PAID','VOIDED'))", "status TEXT NOT NULL CHECK(status IN ('DRAFT','RECEIVED','SETTLED','PAID','VOIDED'))")
  .replace(`${minor("paid_amount_minor")}, ${minor("remaining_amount_minor")}`, `${minor("paid_amount_minor")}, ${minor("settled_amount_minor")}, ${minor("remaining_amount_minor")}`)
  .replace("CHECK(status='VOIDED' OR total_amount_minor=paid_amount_minor+remaining_amount_minor)", "CHECK(status='VOIDED' OR total_amount_minor=paid_amount_minor+settled_amount_minor+remaining_amount_minor)");
if (experimentalInvoiceCreate === invoiceCreate || !experimentalInvoiceCreate.includes("settled_amount_minor") || !experimentalInvoiceCreate.includes("SETTLED")) {
  throw new Error("Exact invoice DDL no longer matches experimental settlement anchors");
}

/** Inert experimental DDL. No initializer imports or selects this statement list. */
export const experimentalInvoiceSettlementSchemaStatements: readonly string[] = exactInvoiceSchemaStatements.map(statement => {
  if (statement === markerInsert) return "INSERT INTO exact_money_schema VALUES ('invoice_experimental_settlement',2)";
  if (statement === invoiceCreate) return experimentalInvoiceCreate;
  return statement;
});
