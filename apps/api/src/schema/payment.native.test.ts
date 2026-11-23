import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { createDatabaseConnection } from "../infrastructure/database/factory";
import { createDrizzleFromSqlite } from "../infrastructure/database/drizzle";
import { BetterSqlite3Executor } from "../infrastructure/database/sqlite-executor";
import { ensureDatabaseSchema } from "../infrastructure/database/schema";
import { payment, paymentAllocation } from "./payment";

// This is the actual legacy initializer, not a declaration-derived fixture.
describe.each(["", "525-public-schema-proof-key"])("initialized payment declaration parity key=%s", key => {
  it("maps every declared payment/allocation column to initialized storage and round-trips through Drizzle and raw SQL", async () => {
    const db = createDatabaseConnection(join(mkdtempSync(join(tmpdir(), "tuari-525-shape-")), "fixture.sqlite"), key);
    try {
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      const paymentColumns = db.pragma("table_info(payment)") as { name: string; type: string }[];
      const allocationColumns = db.pragma("table_info(payment_allocation)") as { name: string; type: string }[];
      expect(paymentColumns.find(column => column.name === "total_amount")?.type).toBe("REAL");
      expect(allocationColumns.find(column => column.name === "amount")?.type).toBe("REAL");
      expect(paymentColumns.some(column => column.name === "amount_dzd")).toBe(false);
      expect(allocationColumns.some(column => column.name === "amount_dzd")).toBe(false);
      expect(Object.values(getTableColumns(payment)).map(column => column.name).sort()).toEqual(paymentColumns.map(column => column.name).sort());
      expect(Object.values(getTableColumns(paymentAllocation)).map(column => column.name).sort()).toEqual(allocationColumns.map(column => column.name).sort());
      const orm = createDrizzleFromSqlite(db);
      const id = randomUUID();
      const date = "2026-11-10T00:00:00.000Z";
      orm.insert(payment).values({ id, counterpartyId: randomUUID(), counterpartyType: "EXTERNAL_COUNTERPARTY", totalAmount: 0.3, paymentMethod: "CASH", paymentDate: date, notes: "Synthetic schema regression", createdAt: date, updatedAt: date }).run();
      expect(db.prepare("SELECT total_amount,notes FROM payment WHERE id=?").get(id)).toEqual({ total_amount: 0.3, notes: "Synthetic schema regression" });
      expect(orm.select().from(payment).all()[0]).toMatchObject({ id, totalAmount: 0.3, notes: "Synthetic schema regression" });
    } finally { db.close(); }
  });
});
