import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../../infrastructure/database/factory";
import { exactInvoiceSchemaStatements } from "./exact-invoice-schema";
import { experimentalInvoiceSettlementSchemaStatements } from "./experimental-invoice-settlement-schema";

describe("experimental invoice settlement DDL", () => {
  it("keeps v1 normal DDL and marker unchanged", () => {
    const db = createDatabaseConnection(":memory:", "");
    try {
      db.exec("CREATE TABLE debt_account(id TEXT PRIMARY KEY); CREATE TABLE debt_entry(id TEXT PRIMARY KEY)");
      db.exec(exactInvoiceSchemaStatements.join(";"));
      expect(db.prepare("SELECT version FROM exact_money_schema WHERE slice='invoice'").get()).toEqual({ version: 1 });
      expect((db.prepare("SELECT sql FROM sqlite_master WHERE name='invoice'").get() as { sql: string }).sql).not.toContain("settled_amount_minor");
    } finally { db.close(); }
  });

  it("accepts settled and reversal states and rejects invalid totals or portions", () => {
    const db = createDatabaseConnection(":memory:", "");
    try {
      db.exec("CREATE TABLE debt_account(id TEXT PRIMARY KEY); CREATE TABLE debt_entry(id TEXT PRIMARY KEY)");
      db.exec(experimentalInvoiceSettlementSchemaStatements.join(";"));
      expect(db.prepare("SELECT version FROM exact_money_schema WHERE slice='invoice_experimental_settlement'").get()).toEqual({ version: 2 });
      const insert = db.prepare(`INSERT INTO invoice(id,supplier_name,counterparty_type,counterparty_id,status,direction,currency,total_amount_minor,paid_amount_minor,settled_amount_minor,remaining_amount_minor,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const row = (id: string, status: string, paid: unknown, settled: unknown, remaining: unknown, total: unknown = 10000) => insert.run(id,"Vendor","EXTERNAL_COUNTERPARTY","party",status,"PURCHASE","DZD",total,paid,settled,remaining,"now","now");
      expect(row("settled","SETTLED",2000,8000,0).changes).toBe(1);
      expect(row("reversed","RECEIVED",2000,0,8000).changes).toBe(1);
      expect(() => row("bad-total","SETTLED",2000,7000,0)).toThrow();
      expect(() => row("negative","RECEIVED",0,-1,10001)).toThrow();
      expect(() => row("fraction","RECEIVED",0,1.5,9998.5)).toThrow();
      expect(() => row("overflow","RECEIVED",0,9223372036854775808n,0)).toThrow();
      expect(() => row("bad-status","OTHER",0,0,10000)).toThrow();
    } finally { db.close(); }
  });
});
