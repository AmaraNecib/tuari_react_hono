export function assertDistinctFixtureInvoices(invoices: unknown[], expectedCount: number): void {
  if (invoices.length !== expectedCount) throw new Error("Unexpected fixture invoice count");
  const ids = new Set<string>();
  const warehouses = new Set<string>();
  for (const invoice of invoices) {
    if (!invoice || typeof invoice !== "object") throw new Error("Invalid fixture invoice");
    const row = invoice as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || typeof row.warehouseId !== "string" || !row.warehouseId) throw new Error("Missing fixture invoice or warehouse identity");
    if (ids.has(row.id) || warehouses.has(row.warehouseId)) throw new Error("Duplicate fixture invoice or warehouse identity");
    if (row.grossTotalDzd !== "24.68") throw new Error("Unexpected fixture invoice gross");
    ids.add(row.id);
    warehouses.add(row.warehouseId);
  }
}
