import {
  Money, UnitPrice, exactInventoryInvoiceSchema, exactInventoryEntrySchema, exactInventoryAssetSchema, exactInventoryChargeSchema, exactInventoryOutboundSchema,
  inventoryItemDefinitionSchema, inventoryConsumableBalanceSchema, inventoryMovementSchema,
  type ExactInventoryInvoice, type ExactInventoryAsset, type ExactInventoryOutbound, type InventoryConsumableBalance, type InventoryMovement,
} from "@tuari/contracts";
import { bindMoney, bindUnitPrice, prepareMoneyRead, prepareUnitPriceRead } from "../../../infrastructure/database/exact-money-storage";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { ExactInventoryRepository, ExactInventoryEntryRecord, ExactInventoryChargeRecord } from "../inventory-exact.repository";
import { exactInventoryQuantityText } from "../inventory-exact-quantity";

const groupFields = { id: "id", invoiceNumber: "invoice_number", supplierName: "supplier_name", invoiceDate: "invoice_date", warehouseId: "warehouse_id", projectId: "project_id", externalCounterpartyId: "external_counterparty_id", debtAccountId: "debt_account_id", debtEntryId: "debt_entry_id", currency: "currency", note: "note", createdAt: "created_at", updatedAt: "updated_at" };
const entryFields = { id: "id", invoiceGroupId: "invoice_group_id", itemDefinitionId: "item_definition_id", warehouseId: "warehouse_id", projectId: "project_id", itemType: "item_type", itemName: "item_name", unit: "unit", quantity: "quantity", note: "note", createdAt: "created_at", updatedAt: "updated_at" };
const assetFields = { id: "id", inventoryEntryId: "inventory_entry_id", assetName: "asset_name", assetTag: "asset_tag", serialNumber: "serial_number", condition: "condition", purchaseDate: "purchase_date", currentWarehouseId: "current_warehouse_id", currentProjectId: "current_project_id", currentLocationLabel: "current_location_label", note: "note", createdAt: "created_at", updatedAt: "updated_at" };
const balanceFields = { id: "id", inventoryEntryId: "inventory_entry_id", itemDefinitionId: "item_definition_id", warehouseId: "warehouse_id", projectId: "project_id", quantity: "quantity", createdAt: "created_at", updatedAt: "updated_at" };
const movementFields = { id: "id", movementType: "movement_type", itemType: "item_type", inventoryEntryId: "inventory_entry_id", assetUnitId: "asset_unit_id", quantity: "quantity", fromWarehouseId: "from_warehouse_id", fromProjectId: "from_project_id", toWarehouseId: "to_warehouse_id", toProjectId: "to_project_id", note: "note", occurredAt: "occurred_at", createdAt: "created_at" };
const auditFields = { actorUserId: "actor_user_id", actorLabel: "actor_label", transactionId: "transaction_id" };
const chargeFields = { id: "id", assetUnitId: "asset_unit_id", projectId: "project_id", movementId: "movement_id", placementSequence: "placement_sequence", status: "status", voidedAt: "voided_at", voidedBy: "voided_by", voidReason: "void_reason", createdAt: "created_at", updatedAt: "updated_at", ...auditFields };
const revisionFields = { id: "id", chargeId: "charge_id", revisionSequence: "revision_sequence", reason: "reason", createdAt: "created_at", ...auditFields };
const outboundFields = { id: "id", transferDate: "transfer_date", fromType: "from_type", fromId: "from_id", counterpartyId: "counterparty_id", transferType: "transfer_type", status: "status", associatedDebtAccountId: "associated_debt_account_id", debtEntryId: "debt_entry_id", initialPaymentEntryId: "initial_payment_entry_id", currency: "currency", notes: "notes", createdAt: "created_at", updatedAt: "updated_at", ...auditFields };
const itemFields = { id: "id", itemId: "item_id", optionId: "option_id", quantity: "quantity", createdAt: "created_at" };
const projection = (fields: Record<string, string>) => Object.entries(fields).map(([key, column]) => `"${column}" AS "${key}"`).join(",");

/** Opt-in native inventory storage. Amount projections alone enable native BigInt reads. */
export class SqliteExactInventoryRepository implements ExactInventoryRepository {
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    requireExactMoneySchema(db, "inventory");
    for (const [table, columns] of [
      ["inventory_invoice_group", { gross_total_minor: "INTEGER", paid_amount_minor: "INTEGER", remaining_debt_minor: "INTEGER", currency: "TEXT", debt_entry_id: "TEXT" }],
      ["inventory_entry", { unit_price_units: "INTEGER", price_source: "TEXT", quantity: "REAL", entry_order: "INTEGER" }],
      ["inventory_asset_unit", { purchase_price_minor: "INTEGER", asset_order: "INTEGER" }],
      ["inventory_outbound_transfer_item", { unit_price_units: "INTEGER", price_source: "TEXT", quantity: "REAL" }],
      ["inventory_outbound_transfer", { currency: "TEXT", debt_entry_id: "TEXT", initial_payment_entry_id: "TEXT" }],
      ["inventory_asset_charge", { amount_minor: "INTEGER", placement_sequence: "INTEGER" }],
      ["inventory_asset_charge_revision", { previous_amount_minor: "INTEGER", new_amount_minor: "INTEGER", revision_sequence: "INTEGER" }],
    ] as const) {
      const actual = db.pragma(`table_info(${table})`) as { name: string; type: string; notnull: number }[];
      for (const [column, type] of Object.entries(columns)) if (actual.find(row => row.name === column)?.type.toUpperCase() !== type) throw new TypeError(`Invalid exact inventory column ${table}.${column}`);
      if (actual.some(row => /(?:price|amount|total|debt)_dzd$/.test(row.name))) throw new TypeError("Legacy inventory monetary columns cannot coexist with exact storage");
      if (table === "inventory_entry" && actual.find(row => row.name === "price_source")?.notnull !== 1) throw new TypeError("Inventory entry requires source operands");
    }
  }
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  withTransaction<T>(work: () => T): T { return this.lock.runSync(() => this.db.transaction(work).immediate()); }
  private row(table: string, fields: Record<string, string>, id: string): Record<string, unknown> | null {
    return this.db.prepare(`SELECT ${projection(fields)} FROM "${table}" WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  }
  private ids(table: string, where = "", parameters: unknown[] = []): string[] {
    return this.boundedIds(this.db.prepare(`SELECT id FROM "${table}" ${where} ORDER BY created_at,id LIMIT 100001`).all(...parameters) as { id: string }[]);
  }
  private boundedIds(rows: { id: string }[]): string[] {
    if (rows.length > 100000) throw new RangeError("Exact inventory read resource limit exceeded");
    return rows.map(row => row.id);
  }
  private money(table: string, column: string, id: string, nullable = false): string | null {
    const value = prepareMoneyRead(this.db, `SELECT "${column}" AS minor_units FROM "${table}" WHERE id=?`).get(id);
    if (value === undefined || (!nullable && value === null)) throw new Error("Required exact inventory amount is missing");
    return value?.toWire() ?? null;
  }
  private price(table: string, id: string): string | null {
    return prepareUnitPriceRead(this.db, `SELECT unit_price_units AS scaled_units FROM "${table}" WHERE id=?`).get(id)?.toWire() ?? null;
  }
  private recordOrder(table: string, column: string, owner: string, ownerId: string, id: string): number {
    const existing = this.db.prepare(`SELECT "${column}" AS sequence FROM "${table}" WHERE id=?`).get(id) as { sequence: number } | undefined;
    if (existing) return existing.sequence;
    const previous = this.db.prepare(`SELECT count(*) AS count FROM "${table}" WHERE "${owner}"=?`).get(ownerId) as { count: number };
    return previous.count;
  }
  private metadata(row: object, fields: Record<string, string>) {
    return Object.fromEntries(Object.entries(fields).map(([key, column]) => [column, (row as Record<string, unknown>)[key] ?? null]));
  }
  private save(table: string, row: Record<string, unknown>) {
    const columns = Object.keys(row);
    this.db.prepare(`INSERT INTO "${table}" (${columns.map(name => `"${name}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(name => name !== "id").map(name => `"${name}"=excluded."${name}"`).join(",")}`).run(...Object.values(row));
  }
  getDefinition(id: string) {
    return this.withTransaction(() => {
      const row = this.db.prepare("SELECT id,name,item_type AS itemType,unit,description,is_active AS isActive,created_at AS createdAt,updated_at AS updatedAt FROM inventory_item_definition WHERE id=?").get(id) as Record<string, unknown> | undefined;
      return row ? inventoryItemDefinitionSchema.parse({ ...row, isActive: row.isActive === 1 }) : null;
    });
  }
  listDefinitions() { return this.withTransaction(() => this.ids("inventory_item_definition").map(id => this.getDefinition(id)!)); }
  warehouseExists(id: string) { return this.lock.runSync(() => Boolean(this.db.prepare("SELECT id FROM warehouse WHERE id=?").get(id))); }
  projectExists(id: string) { return this.lock.runSync(() => Boolean(this.db.prepare("SELECT id FROM project WHERE id=?").get(id))); }
  locationLabel(warehouseId: string | null, projectId: string | null): string {
    return this.lock.runSync(() => {
      const table = warehouseId ? "warehouse" : "project";
      const row = this.db.prepare(`SELECT name FROM "${table}" WHERE id=?`).get(warehouseId ?? projectId) as { name: string } | undefined;
      return row?.name ?? "Unlocated";
    });
  }
  getGroup(id: string) {
    return this.withTransaction(() => {
      const row = this.row("inventory_invoice_group", groupFields, id);
      return row ? exactInventoryInvoiceSchema.parse({ ...row, grossTotalDzd: this.money("inventory_invoice_group", "gross_total_minor", id), paidAmountDzd: this.money("inventory_invoice_group", "paid_amount_minor", id), remainingDebtDzd: this.money("inventory_invoice_group", "remaining_debt_minor", id) }) : null;
    });
  }
  listGroups() { return this.withTransaction(() => this.ids("inventory_invoice_group").map(id => this.getGroup(id)!)); }
  saveGroup(row: ExactInventoryInvoice) { this.withTransaction(() => { this.save("inventory_invoice_group", { ...this.metadata(row, groupFields), gross_total_minor: bindMoney(Money.parse(row.grossTotalDzd)), paid_amount_minor: bindMoney(Money.parse(row.paidAmountDzd)), remaining_debt_minor: bindMoney(Money.parse(row.remainingDebtDzd)) }); }); }
  getEntry(id: string): ExactInventoryEntryRecord | null {
    return this.withTransaction(() => {
      const row = this.row("inventory_entry", { ...entryFields, priceSource: "price_source" }, id);
      if (!row) return null;
      const parsed = exactInventoryEntrySchema.omit({ assets: true }).parse({ ...row, unitPriceDzd: this.price("inventory_entry", id), priceSource: JSON.parse(row.priceSource as string) });
      if (parsed.priceSource.quantity !== exactInventoryQuantityText(parsed.quantity)) throw new Error("Inventory quantity and price source disagree");
      if ((parsed.priceSource.mode === "unit-price" ? parsed.priceSource.price : null) !== parsed.unitPriceDzd) throw new Error("Inventory entered price and source disagree");
      return parsed;
    });
  }
  listEntries(groupId?: string) { return this.withTransaction(() => this.boundedIds(this.db.prepare(`SELECT id FROM inventory_entry ${groupId ? "WHERE invoice_group_id=?" : ""} ORDER BY invoice_group_id,entry_order LIMIT 100001`).all(...(groupId ? [groupId] : [])) as { id: string }[]).map(id => this.getEntry(id)!)); }
  saveEntry(row: ExactInventoryEntryRecord) { this.withTransaction(() => { this.save("inventory_entry", { ...this.metadata(row, entryFields), entry_order: this.recordOrder("inventory_entry", "entry_order", "invoice_group_id", row.invoiceGroupId, row.id), price_source: JSON.stringify(row.priceSource), unit_price_units: row.unitPriceDzd === null ? null : bindUnitPrice(UnitPrice.parse(row.unitPriceDzd)) }); }); }
  getAsset(id: string) {
    return this.withTransaction(() => {
      const row = this.row("inventory_asset_unit", assetFields, id);
      return row ? exactInventoryAssetSchema.parse({ ...row, itemDefinitionId: this.getEntry(row.inventoryEntryId as string)!.itemDefinitionId, purchasePriceDzd: this.money("inventory_asset_unit", "purchase_price_minor", id) }) : null;
    });
  }
  listAssets() { return this.withTransaction(() => this.boundedIds(this.db.prepare("SELECT id FROM inventory_asset_unit ORDER BY inventory_entry_id,asset_order LIMIT 100001").all() as { id: string }[]).map(id => this.getAsset(id)!)); }
  saveAsset(row: ExactInventoryAsset) { this.withTransaction(() => { this.save("inventory_asset_unit", { ...this.metadata(row, assetFields), asset_order: this.recordOrder("inventory_asset_unit", "asset_order", "inventory_entry_id", row.inventoryEntryId, row.id), purchase_price_minor: bindMoney(Money.parse(row.purchasePriceDzd)) }); }); }
  listBalances() {
    return this.withTransaction(() => this.ids("inventory_consumable_balance").map(id => {
      const row = this.row("inventory_consumable_balance", balanceFields, id)!;
      return inventoryConsumableBalanceSchema.parse({ ...row, itemName: this.getEntry(row.inventoryEntryId as string)!.itemName, locationLabel: this.locationLabel(row.warehouseId as string | null, row.projectId as string | null) });
    }));
  }
  saveBalance(row: InventoryConsumableBalance) { this.withTransaction(() => { this.save("inventory_consumable_balance", this.metadata(row, balanceFields)); }); }
  deleteBalance(id: string) { this.withTransaction(() => { this.db.prepare("DELETE FROM inventory_consumable_balance WHERE id=?").run(id); }); }
  listMovements() { return this.withTransaction(() => this.ids("inventory_movement").map(id => inventoryMovementSchema.parse(this.row("inventory_movement", movementFields, id)))); }
  saveMovement(row: InventoryMovement) { this.withTransaction(() => { this.save("inventory_movement", this.metadata(row, movementFields)); }); }
  getCharge(id: string): ExactInventoryChargeRecord | null {
    return this.withTransaction(() => {
      const row = this.row("inventory_asset_charge", chargeFields, id);
      if (!row) return null;
      const revisions = (this.db.prepare("SELECT id FROM inventory_asset_charge_revision WHERE charge_id=? ORDER BY revision_sequence").all(id) as { id: string }[]).map(({ id: revisionId }) => ({ ...this.row("inventory_asset_charge_revision", revisionFields, revisionId), previousAmountDzd: this.money("inventory_asset_charge_revision", "previous_amount_minor", revisionId), newAmountDzd: this.money("inventory_asset_charge_revision", "new_amount_minor", revisionId, true) }));
      return { ...exactInventoryChargeSchema.parse({ ...row, amountDzd: this.money("inventory_asset_charge", "amount_minor", id), projectName: this.locationLabel(null, row.projectId as string), revisions }), actorUserId: row.actorUserId as string | null, actorLabel: row.actorLabel as string | null, transactionId: row.transactionId as string | null };
    });
  }
  listCharges() { return this.withTransaction(() => this.ids("inventory_asset_charge").map(id => this.getCharge(id)!)); }
  saveCharge(row: ExactInventoryChargeRecord) {
    this.withTransaction(() => {
      this.save("inventory_asset_charge", { ...this.metadata(row, chargeFields), amount_minor: bindMoney(Money.parse(row.amountDzd)) });
      for (const revision of row.revisions) this.save("inventory_asset_charge_revision", { ...this.metadata(revision, revisionFields), previous_amount_minor: bindMoney(Money.parse(revision.previousAmountDzd)), new_amount_minor: revision.newAmountDzd === null ? null : bindMoney(Money.parse(revision.newAmountDzd)) });
    });
  }
  getOutbound(id: string) {
    return this.withTransaction(() => {
      const row = this.row("inventory_outbound_transfer", outboundFields, id);
      if (!row) return null;
      const items = (this.db.prepare(`SELECT ${projection(itemFields)},price_source AS source FROM inventory_outbound_transfer_item WHERE transfer_id=? ORDER BY item_order`).all(id) as Record<string, unknown>[]).map(item => ({ ...item, unitPriceDzd: this.price("inventory_outbound_transfer_item", item.id as string), priceSource: item.source === null ? null : JSON.parse(item.source as string) }));
      return exactInventoryOutboundSchema.parse({ ...row, items });
    });
  }
  listOutbounds() { return this.withTransaction(() => this.ids("inventory_outbound_transfer").map(id => this.getOutbound(id)!)); }
  saveOutbound(row: ExactInventoryOutbound) {
    this.withTransaction(() => {
      this.save("inventory_outbound_transfer", this.metadata(row, outboundFields));
      for (const [index, item] of row.items.entries()) this.save("inventory_outbound_transfer_item", { ...this.metadata(item, itemFields), transfer_id: row.id, item_order: index, price_source: item.priceSource === null ? null : JSON.stringify(item.priceSource), unit_price_units: item.unitPriceDzd === null ? null : bindUnitPrice(UnitPrice.parse(item.unitPriceDzd)) });
    });
  }
}
