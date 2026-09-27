import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

/**
 * Expenses domain tables (issue #411).
 *
 * Schema matches the SQL definitions in schema-definitions.ts. The optional
 * references (responsible worker, seller, project, stock item) are plain TEXT
 * columns with no foreign key, mirroring the `payment` table's
 * `counterparty_id`: the references are soft cross-domain links, the service
 * does not validate their existence, and the sqlite and in-memory adapters
 * must behave identically (no DB-side rejection the test double can't mirror).
 */

export const expense = sqliteTable("expense", {
  id: text("id").primaryKey(),
  amountDzd: real("amount_dzd").notNull(),
  expenseDate: text("expense_date").notNull(),
  whatFor: text("what_for"),
  responsibleWorkerId: text("responsible_worker_id"),
  sellerId: text("seller_id"),
  projectId: text("project_id"),
  stockItemId: text("stock_item_id"),
  note: text("note"),
  status: text("status").notNull().default("LIVE"),
  voidedAt: text("voided_at"),
  voidedBy: text("voided_by"),
  voidReason: text("void_reason"),
  actorUserId: text("actor_user_id"),
  actorLabel: text("actor_label"),
  transactionId: text("transaction_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Each edit records who changed what, when, and an optional reason. */
export const expenseRevision = sqliteTable("expense_revision", {
  id: text("id").primaryKey(),
  expenseId: text("expense_id")
    .notNull()
    .references(() => expense.id, { onDelete: "restrict" }),
  previousAmountDzd: real("previous_amount_dzd"),
  newAmountDzd: real("new_amount_dzd").notNull(),
  reason: text("reason"),
  actorUserId: text("actor_user_id"),
  actorLabel: text("actor_label"),
  transactionId: text("transaction_id"),
  createdAt: text("created_at").notNull(),
});
