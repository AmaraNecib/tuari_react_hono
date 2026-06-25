import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Payment domain tables.
 * Schema matches the existing SQL definitions in schema-definitions.ts.
 */

export const payment = sqliteTable("payment", {
  id: text("id").primaryKey(),
  counterpartyId: text("counterparty_id").notNull(),
  counterpartyType: text("counterparty_type").notNull(),
  amountDzd: real("amount_dzd").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentDate: text("payment_date").notNull(),
  note: text("note"),
  actorUserId: text("actor_user_id"),
  actorLabel: text("actor_label"),
  transactionId: text("transaction_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const paymentAllocation = sqliteTable("payment_allocation", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => payment.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id").notNull(),
  amountDzd: real("amount_dzd").notNull(),
  createdAt: text("created_at").notNull(),
});
