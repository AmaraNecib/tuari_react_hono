import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { project, warehouse, debtAccount, externalCounterparty } from "./company";

/**
 * Inventory domain tables.
 * Schema matches the existing SQL definitions in schema-definitions.ts.
 */

/** Item type definitions (cement, rebar, tools, etc.). */
export const inventoryItemDefinition = sqliteTable(
  "inventory_item_definition",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    itemType: text("item_type").notNull(),
    unit: text("unit"),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    transactionId: text("transaction_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

/** Purchase/sale invoice headers — groups line items from one transaction. */
export const inventoryInvoiceGroup = sqliteTable("inventory_invoice_group", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number"),
  supplierName: text("supplier_name"),
  invoiceDate: text("invoice_date"),
  warehouseId: text("warehouse_id").references(() => warehouse.id, {
    onDelete: "set null",
  }),
  projectId: text("project_id").references(() => project.id, {
    onDelete: "set null",
  }),
  externalCounterpartyId: text("external_counterparty_id").references(
    () => externalCounterparty.id,
  ),
  grossTotalDzd: real("gross_total_dzd").notNull().default(0),
  paidAmountDzd: real("paid_amount_dzd").notNull().default(0),
  remainingDebtDzd: real("remaining_debt_dzd").notNull().default(0),
  debtAccountId: text("debt_account_id").references(() => debtAccount.id),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Invoice line items — individual items within an invoice group. */
export const inventoryEntry = sqliteTable("inventory_entry", {
  id: text("id").primaryKey(),
  invoiceGroupId: text("invoice_group_id")
    .notNull()
    .references(() => inventoryInvoiceGroup.id, { onDelete: "cascade" }),
  itemDefinitionId: text("item_definition_id")
    .notNull()
    .references(() => inventoryItemDefinition.id),
  warehouseId: text("warehouse_id").references(() => warehouse.id, {
    onDelete: "set null",
  }),
  projectId: text("project_id").references(() => project.id, {
    onDelete: "set null",
  }),
  itemType: text("item_type").notNull(),
  itemName: text("item_name").notNull(),
  unit: text("unit"),
  quantity: real("quantity").notNull(),
  unitPriceDzd: real("unit_price_dzd"),
  totalPriceDzd: real("total_price_dzd").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Individual asset units (each with unique serial/tag). */
export const inventoryAssetUnit = sqliteTable("inventory_asset_unit", {
  id: text("id").primaryKey(),
  inventoryEntryId: text("inventory_entry_id")
    .notNull()
    .references(() => inventoryEntry.id, { onDelete: "cascade" }),
  assetName: text("asset_name").notNull(),
  assetTag: text("asset_tag"),
  serialNumber: text("serial_number"),
  condition: text("condition"),
  purchaseDate: text("purchase_date"),
  purchasePriceDzd: real("purchase_price_dzd").notNull(),
  currentWarehouseId: text("current_warehouse_id").references(
    () => warehouse.id,
  ),
  currentProjectId: text("current_project_id").references(() => project.id),
  currentLocationLabel: text("current_location_label"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Consumable stock balances per entry and location. */
export const inventoryConsumableBalance = sqliteTable(
  "inventory_consumable_balance",
  {
    id: text("id").primaryKey(),
    inventoryEntryId: text("inventory_entry_id")
      .notNull()
      .references(() => inventoryEntry.id),
    itemDefinitionId: text("item_definition_id")
      .notNull()
      .references(() => inventoryItemDefinition.id),
    warehouseId: text("warehouse_id").references(() => warehouse.id),
    projectId: text("project_id").references(() => project.id),
    quantity: real("quantity").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

/** Inventory movements — purchase, transfer, outbound sale records. */
export const inventoryMovement = sqliteTable("inventory_movement", {
  id: text("id").primaryKey(),
  movementType: text("movement_type").notNull(),
  itemType: text("item_type").notNull(),
  inventoryEntryId: text("inventory_entry_id").references(
    () => inventoryEntry.id,
  ),
  assetUnitId: text("asset_unit_id").references(() => inventoryAssetUnit.id),
  quantity: real("quantity").notNull(),
  fromWarehouseId: text("from_warehouse_id").references(() => warehouse.id),
  fromProjectId: text("from_project_id").references(() => project.id),
  toWarehouseId: text("to_warehouse_id").references(() => warehouse.id),
  toProjectId: text("to_project_id").references(() => project.id),
  note: text("note"),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull(),
});

/** File attachments linked to invoice groups. */
export const inventoryInvoiceAttachment = sqliteTable(
  "inventory_invoice_attachment",
  {
    id: text("id").primaryKey(),
    invoiceGroupId: text("invoice_group_id")
      .notNull()
      .references(() => inventoryInvoiceGroup.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    relativePath: text("relative_path").notNull(),
    sha256: text("sha256"),
    createdAt: text("created_at").notNull(),
  },
);
