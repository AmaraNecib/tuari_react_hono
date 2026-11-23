import { describe, expect, it } from "vitest";
import { createDatabaseConnection } from "../../infrastructure/database/factory";
import { createFifoLock } from "../../infrastructure/database/fifo-lock";
import { SqliteExactExpenseRepository } from "./adapters/sqlite-exact-expenses.repository";
import { exactExpenseSchemaStatements } from "./expenses.exact-schema";
import { createExactExpensesModule } from "./expenses.exact";

function fixture(transform: (sql: string) => string = sql => sql) {
  const db = createDatabaseConnection(":memory:", "");
  for (const sql of exactExpenseSchemaStatements) db.exec(transform(sql));
  return db;
}

describe("expense-owned physical schema validation", () => {
  it("requires the shared marker even when expense columns look exact", () => {
    const db = fixture();
    try {
      db.exec("DELETE FROM exact_money_schema");
      expect(() => new SqliteExactExpenseRepository(db, createFifoLock())).toThrow();
    } finally { db.close(); }
  });
  it.each([
    ["amount_minor INTEGER NOT NULL", "amount_minor REAL NOT NULL"],
    ["currency TEXT NOT NULL", "currency BLOB NOT NULL"],
    ["previous_amount_minor INTEGER", "previous_amount_minor REAL"],
    ["new_amount_minor INTEGER NOT NULL", "new_amount_minor REAL NOT NULL"],
    ["amount_minor INTEGER NOT NULL", "amount_minor INTEGER"],
    ["currency TEXT NOT NULL", "currency TEXT"],
    ["previous_amount_minor INTEGER", "previous_amount_minor INTEGER NOT NULL"],
    ["new_amount_minor INTEGER NOT NULL", "new_amount_minor INTEGER"],
  ])("rejects incompatible declaration %s -> %s independently of the marker", (before, after) => {
    const db = fixture(sql => sql.replace(`    ${before}`, `    ${after}`));
    try { expect(() => new SqliteExactExpenseRepository(db, createFifoLock())).toThrow(); }
    finally { db.close(); }
  });
  it("rejects a hybrid marked schema retaining legacy monetary columns", () => {
    const db = fixture(sql => sql.replace("    amount_minor INTEGER NOT NULL", "    amount_dzd REAL, amount_minor INTEGER NOT NULL"));
    try { expect(() => new SqliteExactExpenseRepository(db, createFifoLock())).toThrow(); }
    finally { db.close(); }
  });
  it("checks INTEGER storage class and DZD on reads even if database CHECKs were bypassed", async () => {
    const db = fixture();
    try {
      const repo = new SqliteExactExpenseRepository(db, createFifoLock());
      const service = createExactExpensesModule(repo);
      await service.create({ id: "one", amount: "0.10", expenseDate: "2026-10-03T10:00:00.000Z" });
      db.pragma("ignore_check_constraints = ON");
      db.exec("UPDATE expense SET amount_minor = 0.125");
      await expect(repo.findById("one")).rejects.toThrow(/INTEGER/);
      db.exec("UPDATE expense SET amount_minor = 10, currency = 'USD'");
      await expect(repo.findById("one")).rejects.toThrow(/DZD/);
      expect(() => new SqliteExactExpenseRepository(db, createFifoLock())).toThrow(/currency/);
      db.exec("UPDATE expense SET currency = 'DZD'");
      await repo.createRevision({ id: "r1", expenseId: "one", previousAmount: null, newAmount: "0.20", changedFields: [], reason: null, createdAt: "2026-10-04T10:00:00.000Z" });
      db.exec("UPDATE expense_revision SET previous_amount_minor = 0.125");
      await expect(repo.listRevisionsByExpenseId("one")).rejects.toThrow(/INTEGER/);
    } finally { db.close(); }
  });
  it("fresh fixture CHECKs reject fractional minor units and wrong currency but retain nullable previous amounts", async () => {
    const db = fixture();
    try {
      const repo = new SqliteExactExpenseRepository(db, createFifoLock());
      await createExactExpensesModule(repo).create({ id: "one", amount: "0.10", expenseDate: "2026-10-03T10:00:00.000Z" });
      expect(() => db.exec("UPDATE expense SET amount_minor = 0.125")).toThrow();
      expect(() => db.exec("UPDATE expense SET amount_minor = 0")).toThrow();
      expect(() => db.exec("UPDATE expense SET currency = 'USD'")).toThrow();
      await repo.createRevision({ id: "r1", expenseId: "one", previousAmount: null, newAmount: "0.20", changedFields: [], reason: null, createdAt: "2026-10-04T10:00:00.000Z" });
      expect(await repo.listRevisionsByExpenseId("one")).toMatchObject([{ previousAmount: null, newAmount: "0.20" }]);
    } finally { db.close(); }
  });
});
