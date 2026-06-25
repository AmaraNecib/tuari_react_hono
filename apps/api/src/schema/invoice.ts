/**
 * Invoice domain tables.
 * Schema matches the existing SQL definitions in schema-definitions.ts.
 */
import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { warehouse, project, debtAccount } from "./company";

/** Purchase/sale invoice headers. */
export const invoice = sqliteTable("invoice", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number"),
  supplierName: text("supplier_name").notNull(),
  supplierPhone: text("supplier_phone"),
  warehouseId: text("warehouse_id").references(() => warehouse.id, {
    onDelete: "set null",
  }),
  projectId: text("project_id").references(() => project.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("DRAFT"),
  direction: text("direction").notNull().default("PURCHASE"),
  invoiceDate: text("invoice_date"),
  dueDate: text("due_date"),
  currency: text("currency").notNull().default("DZD"),
  totalAmount: real("total_amount").notNull().default(0),
  paidAmount: real("paid_amount").notNull().default(0),
  remainingAmount: real("remaining_amount").notNull().default(0),
  notes: text("notes"),
  debtAccountId: text("debt_account_id").references(() => debtAccount.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Invoice line items — individual items within an invoice. */
export const invoiceLineItem = sqliteTable("invoice_line_item", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoice.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  total: real("total").notNull(),
});
