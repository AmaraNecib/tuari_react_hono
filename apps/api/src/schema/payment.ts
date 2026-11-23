import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

/**
 * Payment domain tables.
 * Schema matches the existing SQL definitions in schema-definitions.ts.
 */

/** Payment records — cash, bank transfer, or check transactions. */
export const payment = sqliteTable("payment", {
  id: text("id").primaryKey(),
  counterpartyId: text("counterparty_id").notNull(),
  counterpartyType: text("counterparty_type").notNull(),
  totalAmount: real("total_amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentDate: text("payment_date").notNull(),
  notes: text("notes"),
  actorUserId: text("actor_user_id"),
  actorLabel: text("actor_label"),
  transactionId: text("transaction_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Payment-to-invoice allocation — distributes one payment across invoices. */
export const paymentAllocation = sqliteTable("payment_allocation", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => payment.id, { onDelete: "restrict" }),
  invoiceId: text("invoice_id").notNull(),
  amount: real("amount").notNull(),
  createdAt: text("created_at").notNull(),
});
