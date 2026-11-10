import type { ExactInventoryInvoice, ExactInventoryAsset, ExactInventoryOutbound, InventoryItemDefinition, InventoryConsumableBalance, InventoryMovement } from "@tuari/contracts";
import type { ExactTransactionIdentity } from "../../company/exact-finance.repository";
import type { ExactInventoryRepository, ExactInventoryEntryRecord, ExactInventoryChargeRecord } from "../inventory-exact.repository";

/** One domain snapshot enlists with the authoritative ledger snapshot. */
export class InMemoryExactInventoryRepository implements ExactInventoryRepository {
  private groups = new Map<string, ExactInventoryInvoice>();
  private entries = new Map<string, ExactInventoryEntryRecord>();
  private assets = new Map<string, ExactInventoryAsset>();
  private balances = new Map<string, InventoryConsumableBalance>();
  private movements = new Map<string, InventoryMovement>();
  private charges = new Map<string, ExactInventoryChargeRecord>();
  private outbounds = new Map<string, ExactInventoryOutbound>();
  constructor(readonly transactionIdentity: ExactTransactionIdentity, private readonly references: {
    definitions: InventoryItemDefinition[]; warehouses: { id: string; name: string }[]; projects: { id: string; name: string }[];
  }) {}
  withTransaction<T>(work: () => T): T {
    const before = structuredClone([this.groups, this.entries, this.assets, this.balances, this.movements, this.charges, this.outbounds] as const);
    try {
      const result = work();
      if (result && typeof (result as { then?: unknown }).then === "function") throw new TypeError("Inventory transaction must be synchronous");
      return result;
    } catch (error) { [this.groups, this.entries, this.assets, this.balances, this.movements, this.charges, this.outbounds] = before; throw error; }
  }
  getDefinition(id: string) { return structuredClone(this.references.definitions.find(row => row.id === id) ?? null); }
  listDefinitions() { return structuredClone(this.references.definitions); }
  warehouseExists(id: string) { return this.references.warehouses.some(row => row.id === id); }
  projectExists(id: string) { return this.references.projects.some(row => row.id === id); }
  locationLabel(warehouseId: string | null, projectId: string | null) { return this.references.warehouses.find(row => row.id === warehouseId)?.name ?? this.references.projects.find(row => row.id === projectId)?.name ?? "Unlocated"; }
  getGroup(id: string) { return structuredClone(this.groups.get(id) ?? null); }
  listGroups() { return structuredClone([...this.groups.values()]); }
  saveGroup(row: ExactInventoryInvoice) { this.groups.set(row.id, structuredClone(row)); }
  getEntry(id: string) { return structuredClone(this.entries.get(id) ?? null); }
  listEntries(groupId?: string) { return structuredClone([...this.entries.values()].filter(row => !groupId || row.invoiceGroupId === groupId)); }
  saveEntry(row: ExactInventoryEntryRecord) { this.entries.set(row.id, structuredClone(row)); }
  getAsset(id: string) { return structuredClone(this.assets.get(id) ?? null); }
  listAssets() { return structuredClone([...this.assets.values()]); }
  saveAsset(row: ExactInventoryAsset) { this.assets.set(row.id, structuredClone(row)); }
  listBalances() { return structuredClone([...this.balances.values()]); }
  saveBalance(row: InventoryConsumableBalance) { this.balances.set(row.id, structuredClone(row)); }
  deleteBalance(id: string) { this.balances.delete(id); }
  listMovements() { return structuredClone([...this.movements.values()]); }
  saveMovement(row: InventoryMovement) { this.movements.set(row.id, structuredClone(row)); }
  getCharge(id: string) { return structuredClone(this.charges.get(id) ?? null); }
  listCharges() { return structuredClone([...this.charges.values()]); }
  saveCharge(row: ExactInventoryChargeRecord) { this.charges.set(row.id, structuredClone(row)); }
  getOutbound(id: string) { return structuredClone(this.outbounds.get(id) ?? null); }
  listOutbounds() { return structuredClone([...this.outbounds.values()]); }
  saveOutbound(row: ExactInventoryOutbound) { this.outbounds.set(row.id, structuredClone(row)); }
}
