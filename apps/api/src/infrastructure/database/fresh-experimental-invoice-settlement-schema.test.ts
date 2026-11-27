import { expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createFifoLock } from "./fifo-lock";
import { createExactCommerceServices } from "../../rpc/exact-commerce-composition";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabaseConnection } from "./factory";
import { ensureFreshExactApplicationSchema } from "./fresh-exact-schema";
import { ensureFreshManualSettlementApplicationSchema } from "./fresh-manual-settlement-schema";
import { ensureFreshExperimentalInvoiceSettlementSchema } from "./fresh-experimental-invoice-settlement-schema";

const snapshot = (db: ReturnType<typeof createDatabaseConnection>) => ({ schema: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(), markers: db.prepare("SELECT * FROM exact_money_schema ORDER BY slice").all(), app: db.prepare("SELECT key FROM app_schema_state ORDER BY key").all(), changes: db.prepare("SELECT total_changes() count").get() });
it("creates and reattests the experimental full graph without writes", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "tuari-615-experimental-")), "application.sqlite");
  let db = createDatabaseConnection(path, "", { journalMode: "preserve" });
  try {
    await ensureFreshExperimentalInvoiceSettlementSchema(db);
    expect(db.prepare("SELECT version FROM exact_money_schema WHERE slice='invoice_experimental_settlement'").get()).toEqual({ version: 2 });
    expect(db.prepare("SELECT key FROM app_schema_state WHERE key='fresh_experimental_invoice_settlement_v2'").get()).toBeTruthy();
    const before = snapshot(db);
    await ensureFreshExperimentalInvoiceSettlementSchema(db);
    expect(snapshot(db)).toEqual(before);
    db.close();
    db = createDatabaseConnection(path, "", { journalMode: "preserve" });
    const beforeReopenAttestation = snapshot(db);
    await ensureFreshExperimentalInvoiceSettlementSchema(db);
    expect(snapshot(db)).toEqual(beforeReopenAttestation);
  } finally { db.close(); }
});
it.each(["trigger", "invoice-marker", "app-marker", "foreign-key"] as const)("refuses tampered experimental graph (%s) without extra writes", async tamper => {
  const db = createDatabaseConnection(":memory:", "", { journalMode: "preserve" });
  try {
    await ensureFreshExperimentalInvoiceSettlementSchema(db);
    if (tamper === "trigger") db.exec("DROP TRIGGER exact_invoice_owner_immutable");
    if (tamper === "invoice-marker") db.exec("UPDATE exact_money_schema SET version=99 WHERE slice='invoice_experimental_settlement'");
    if (tamper === "app-marker") db.exec("DELETE FROM app_schema_state WHERE key='fresh_experimental_invoice_settlement_v2'");
    if (tamper === "foreign-key") {
      db.pragma("foreign_keys=OFF");
      db.exec("INSERT INTO invoice_line_item(id,invoice_id,description,line_order,price_source) VALUES ('orphan','missing','x',0,'{}')");
      db.pragma("foreign_keys=ON");
    }
    const before = snapshot(db);
    await expect(ensureFreshExperimentalInvoiceSettlementSchema(db)).rejects.toThrow(/experimental invoice settlement schema/i);
    expect(snapshot(db)).toEqual(before);
  } finally { db.close(); }
});
it.each(["exact", "manual"] as const)("preserves populated %s database bytes and financial records across refusal and normal reopen", async kind => {
  const path = join(mkdtempSync(join(tmpdir(), `tuari-615-preserve-${kind}-`)), "application.sqlite");
  const initialize = kind === "exact" ? ensureFreshExactApplicationSchema : ensureFreshManualSettlementApplicationSchema;
  const open = () => createDatabaseConnection(path, "", { journalMode: "preserve" });
  const hash = () => createHash("sha256").update(readFileSync(path)).digest("hex");
  const now = "2026-11-25T12:00:00.000Z";
  let db = open();
  try {
    await initialize(db);
    db.prepare("INSERT INTO external_counterparty(id,full_name,phone_number,note,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("preserved-party", "Preserved supplier", "+213000000000", "Existing supported data", now, now);
    const services = createExactCommerceServices(db, createFifoLock(), { id: randomUUID, now: () => now });
    const draft = services.invoices.createInvoice({ requestId: "preserved-draft", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "preserved-party", supplierName: "Preserved supplier", currency: "DZD", direction: "PURCHASE", lineItems: [{ description: "Existing purchase", source: { mode: "agreed-total", quantity: "1", total: "100.00" } }] });
    const invoice = services.invoices.receiveInvoice({ requestId: "preserved-receive", id: draft.id });
    const payment = services.invoices.createPayment({ requestId: "preserved-payment", counterpartyType: "EXTERNAL_COUNTERPARTY", counterpartyId: "preserved-party", direction: "PURCHASE", paymentDate: now, paymentMethod: "BANK_TRANSFER", totalAmount: "20.00", allocations: [{ invoiceId: invoice.id, amount: "20.00" }] });
    const readRecords = () => {
      const current = createExactCommerceServices(db, createFifoLock(), { id: randomUUID, now: () => now });
      return { invoice: current.invoices.getInvoice(invoice.id), payment: current.invoices.getPayment(payment.id), account: current.finance.detail(invoice.debtAccountId!), party: db.prepare("SELECT * FROM external_counterparty WHERE id=?").get("preserved-party") };
    };
    const original = readRecords();
    expect(original.invoice).toMatchObject({ totalAmount: "100.00", paidAmount: "20.00", remainingAmount: "80.00", status: "RECEIVED" });
    expect(original.payment).toMatchObject({ totalAmount: "20.00", unallocatedAmount: "0.00", status: "LIVE" });
    db.close();
    const originalHash = hash();
    db = open();
    const beforeRefusal = snapshot(db);
    await expect(ensureFreshExperimentalInvoiceSettlementSchema(db)).rejects.toThrow(/experimental invoice settlement schema/i);
    expect(snapshot(db)).toEqual(beforeRefusal);
    expect(readRecords()).toEqual(original);
    db.close();
    expect(hash()).toBe(originalHash);
    db = open();
    const beforeNormal = snapshot(db);
    await initialize(db);
    expect(snapshot(db)).toEqual(beforeNormal);
    expect(readRecords()).toEqual(original);
    db.close();
    expect(hash()).toBe(originalHash);
    db = open();
  } finally { db.close(); }
});

it.each(["exact", "manual"] as const)("refuses %s schema without writes and leaves its initializer working", async kind => {
  const db = createDatabaseConnection(":memory:", "", { journalMode: "preserve" });
  try {
    if (kind === "exact") await ensureFreshExactApplicationSchema(db);
    else await ensureFreshManualSettlementApplicationSchema(db);
    const before = snapshot(db);
    await expect(ensureFreshExperimentalInvoiceSettlementSchema(db)).rejects.toThrow(/experimental invoice settlement schema/i);
    expect(snapshot(db)).toEqual(before);
    if (kind === "exact") await ensureFreshExactApplicationSchema(db);
    else await ensureFreshManualSettlementApplicationSchema(db);
    expect(snapshot(db)).toEqual(before);
  } finally { db.close(); }
});
