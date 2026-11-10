import { schemaStatements } from "../../../infrastructure/database/schema-definitions";

const table = (name: string) => {
  const statement = schemaStatements.find(sql => sql.startsWith(`CREATE TABLE IF NOT EXISTS "${name}"`));
  if (!statement) throw new Error(`Missing initialized inventory table ${name}`);
  return statement.replace("CREATE TABLE IF NOT EXISTS", "CREATE TABLE");
};
const scaled = (sql: string, name: string, nullable = false) => sql.replace(`"${name}" REAL`, `"${name}" INTEGER CHECK("${name}" IS ${nullable ? "NULL OR" : "NOT NULL AND"} (typeof("${name}")='integer' AND "${name}" BETWEEN 0 AND 9223372036854775807))`);
const renamed = (sql: string, fields: Record<string, string>) => Object.entries(fields).reduce((result, [oldName, newName]) => result.replaceAll(`"${oldName}"`, `"${newName}"`), sql);

/** Fresh isolated exact fixtures only. Never a migration or production initializer. */
export const exactInventorySchemaStatements: readonly string[] = (() => {
  let group = renamed(table("inventory_invoice_group"), { gross_total_dzd: "gross_total_minor", paid_amount_dzd: "paid_amount_minor", remaining_debt_dzd: "remaining_debt_minor" });
  for (const field of ["gross_total_minor", "paid_amount_minor", "remaining_debt_minor"]) group = scaled(group, field);
  group = group.replace('"debt_account_id" TEXT,', '"debt_account_id" TEXT REFERENCES debt_account(id), "debt_entry_id" TEXT REFERENCES debt_entry(id), "currency" TEXT NOT NULL CHECK(currency=\'DZD\'),');
  let entry = table("inventory_entry")
    .replace('"unit_price_dzd" REAL,', '"unit_price_units" INTEGER CHECK(unit_price_units IS NULL OR (typeof(unit_price_units)=\'integer\' AND unit_price_units BETWEEN 0 AND 9223372036854775807)),')
    .replace('"total_price_dzd" REAL NOT NULL,', '"price_source" TEXT NOT NULL,')
    .replace('    CONSTRAINT "inventory_entry_total_price_check"\n      CHECK ("total_price_dzd" >= 0),\n', '')
    .replaceAll('"unit_price_dzd"', '"unit_price_units"');
  entry = entry.replace('"invoice_group_id" TEXT NOT NULL,', '"invoice_group_id" TEXT NOT NULL, "entry_order" INTEGER NOT NULL,');
  // schemaStatements contains the original table shape. Runtime permits the
  // initialized outbound movement kind too; preserve that current behavior.
  const movement = table("inventory_movement").replace("('PURCHASE', 'TRANSFER')", "('PURCHASE', 'TRANSFER', 'OUTBOUND_SALE')");
  const outbound = table("inventory_outbound_transfer").replace('"associated_debt_account_id" TEXT,', '"associated_debt_account_id" TEXT REFERENCES debt_account(id), "debt_entry_id" TEXT REFERENCES debt_entry(id), "initial_payment_entry_id" TEXT REFERENCES debt_entry(id), "currency" TEXT NOT NULL CHECK(currency=\'DZD\'),');
  const outboundItem = table("inventory_outbound_transfer_item").replace('"unit_price_dzd" REAL,', '"unit_price_units" INTEGER CHECK(unit_price_units IS NULL OR (typeof(unit_price_units)=\'integer\' AND unit_price_units BETWEEN 0 AND 9223372036854775807)), "price_source" TEXT, "option_id" TEXT, "item_order" INTEGER NOT NULL,');
  const asset = scaled(renamed(table("inventory_asset_unit"), { purchase_price_dzd: "purchase_price_minor" }), "purchase_price_minor").replace('"inventory_entry_id" TEXT NOT NULL,', '"inventory_entry_id" TEXT NOT NULL, "asset_order" INTEGER NOT NULL,');
  const charge = scaled(renamed(table("inventory_asset_charge"), { amount_dzd: "amount_minor" }), "amount_minor").replace('"movement_id" TEXT,', '"movement_id" TEXT, "placement_sequence" INTEGER NOT NULL CHECK(placement_sequence BETWEEN 1 AND 100000),');
  let revision = renamed(table("inventory_asset_charge_revision"), { previous_amount_dzd: "previous_amount_minor", new_amount_dzd: "new_amount_minor" });
  revision = scaled(scaled(revision, "previous_amount_minor"), "new_amount_minor", true).replace('"charge_id" TEXT NOT NULL,', '"charge_id" TEXT NOT NULL, "revision_sequence" INTEGER NOT NULL CHECK(revision_sequence BETWEEN 1 AND 100000),');
  return [
    "CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY,version INTEGER NOT NULL)",
    "INSERT INTO exact_money_schema VALUES ('inventory',1)",
    table("inventory_item_definition"), group, entry, asset, table("inventory_consumable_balance"), movement,
    charge, revision, table("inventory_invoice_attachment"), outbound, outboundItem,
    "CREATE UNIQUE INDEX exact_inventory_entry_order ON inventory_entry(invoice_group_id,entry_order)",
    "CREATE UNIQUE INDEX exact_inventory_asset_order ON inventory_asset_unit(inventory_entry_id,asset_order)",
    "CREATE UNIQUE INDEX exact_inventory_placement_sequence ON inventory_asset_charge(asset_unit_id,placement_sequence)",
    "CREATE UNIQUE INDEX exact_inventory_revision_sequence ON inventory_asset_charge_revision(charge_id,revision_sequence)",
    "CREATE TRIGGER exact_inventory_revision_immutable BEFORE UPDATE ON inventory_asset_charge_revision WHEN NEW.charge_id IS NOT OLD.charge_id OR NEW.previous_amount_minor IS NOT OLD.previous_amount_minor OR NEW.new_amount_minor IS NOT OLD.new_amount_minor OR NEW.revision_sequence IS NOT OLD.revision_sequence OR NEW.reason IS NOT OLD.reason OR NEW.actor_user_id IS NOT OLD.actor_user_id OR NEW.actor_label IS NOT OLD.actor_label OR NEW.transaction_id IS NOT OLD.transaction_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'Charge revision is immutable'); END",
    "CREATE UNIQUE INDEX exact_inventory_placement_identity ON inventory_asset_charge(movement_id) WHERE movement_id IS NOT NULL",
    "CREATE UNIQUE INDEX exact_inventory_outbound_order ON inventory_outbound_transfer_item(transfer_id,item_order)",
    "CREATE TRIGGER exact_inventory_currency_immutable BEFORE UPDATE ON inventory_invoice_group WHEN NEW.currency IS NOT OLD.currency OR NEW.external_counterparty_id IS NOT OLD.external_counterparty_id OR NEW.gross_total_minor IS NOT OLD.gross_total_minor OR (OLD.debt_entry_id IS NOT NULL AND (NEW.debt_entry_id IS NOT OLD.debt_entry_id OR NEW.debt_account_id IS NOT OLD.debt_account_id)) BEGIN SELECT RAISE(ABORT,'Inventory purchase identity is immutable'); END",
    "CREATE TRIGGER exact_inventory_outbound_identity BEFORE UPDATE ON inventory_outbound_transfer WHEN NEW.currency IS NOT OLD.currency OR NEW.counterparty_id IS NOT OLD.counterparty_id OR NEW.from_type IS NOT OLD.from_type OR NEW.from_id IS NOT OLD.from_id OR NEW.transfer_type IS NOT OLD.transfer_type OR (OLD.debt_entry_id IS NOT NULL AND NEW.debt_entry_id IS NOT OLD.debt_entry_id) BEGIN SELECT RAISE(ABORT,'Inventory outbound identity is immutable'); END",
  ];
})();
