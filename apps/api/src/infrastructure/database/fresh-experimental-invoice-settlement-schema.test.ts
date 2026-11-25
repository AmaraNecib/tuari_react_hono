import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
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
