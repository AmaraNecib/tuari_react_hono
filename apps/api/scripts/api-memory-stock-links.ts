import type Database from "better-sqlite3";

export function assertStockLinks(db: Database.Database, expected: number): { warehouses: number; definitions: number } {
  const links = db.prepare(`
    SELECT COUNT(DISTINCT w.id) AS warehouses, COUNT(DISTINCT d.id) AS definitions
    FROM inventory_invoice_group g
    JOIN inventory_entry e ON e.invoice_group_id = g.id
    JOIN inventory_consumable_balance b ON b.inventory_entry_id = e.id
    JOIN warehouse w ON w.id = g.warehouse_id AND w.name LIKE 'Fixture warehouse %'
    JOIN inventory_item_definition d ON d.id = e.item_definition_id AND d.name LIKE 'Fixture consumable %'
  `).get() as { warehouses: number; definitions: number };
  if (links.warehouses !== expected || links.definitions !== expected) throw new Error("Fixture stock links are not globally distinct");
  return links;
}
