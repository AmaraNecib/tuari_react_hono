import { Money, type ExactInventoryHistoryRow } from "@tuari/contracts";
import type { ExactInventoryRepository } from "./inventory-exact.repository";

export type HistoryKey = { source: "purchase" | "movement" | "outbound"; id: string };
export type HistoryCandidate = HistoryKey & Pick<ExactInventoryHistoryRow, "date" | "type" | "from" | "to" | "counterparty" | "note"> & {
  itemNames: string[];
  totalAmountDzd: string | null;
  debtAccountId: string | null;
  debtEntryId: string | null;
};

/** Memory parity uses the same candidate semantics, without changing write storage. */
export function memoryHistoryCandidates(repo: ExactInventoryRepository): HistoryCandidate[] {
  const place = (warehouse: string | null, project: string | null) => warehouse || project ? { type: warehouse ? "WAREHOUSE" as const : "PROJECT" as const, id: (warehouse ?? project)!, name: repo.locationLabel(warehouse, project) } : null;
  const entries = new Map(repo.listEntries().map(row => [row.id, row]));
  const definitions = new Map(repo.listDefinitions().map(row => [row.id, row]));
  return [
    ...repo.listGroups().map(row => ({ source: "purchase" as const, id: row.id, date: row.invoiceDate ?? row.createdAt, type: "PURCHASE" as const, from: null, to: place(row.warehouseId, row.projectId), counterparty: row.externalCounterpartyId ? { id: row.externalCounterpartyId, name: row.supplierName ?? repo.counterpartyLabel(row.externalCounterpartyId) } : null, note: row.note, itemNames: [...entries.values()].filter(entry => entry.invoiceGroupId === row.id).map(entry => entry.itemName), totalAmountDzd: row.grossTotalDzd, debtAccountId: null, debtEntryId: null })),
    ...repo.listMovements().filter(row => row.movementType !== "PURCHASE" && row.movementType !== "OUTBOUND_SALE").map(row => { const entry = entries.get(row.inventoryEntryId ?? ""); return { source: "movement" as const, id: row.id, date: row.occurredAt, type: "INTERNAL" as const, from: place(row.fromWarehouseId, row.fromProjectId), to: place(row.toWarehouseId, row.toProjectId), counterparty: null, note: row.note, itemNames: [row.assetUnitId ? repo.getAsset(row.assetUnitId)?.assetName ?? entry?.itemName ?? "" : definitions.get(entry?.itemDefinitionId ?? "")?.name ?? entry?.itemName ?? ""], totalAmountDzd: null, debtAccountId: null, debtEntryId: null }; }),
    ...repo.listOutbounds().map(row => ({ source: "outbound" as const, id: row.id, date: row.transferDate, type: row.transferType, from: place(row.fromType === "WAREHOUSE" ? row.fromId : null, row.fromType === "PROJECT" ? row.fromId : null), to: null, counterparty: { id: row.counterpartyId, name: repo.counterpartyLabel(row.counterpartyId) }, note: row.notes, itemNames: row.items.map(item => definitions.get(item.itemId)?.name ?? item.itemId), totalAmountDzd: null, debtAccountId: row.associatedDebtAccountId, debtEntryId: row.debtEntryId })),
  ];
}

export function absoluteHistoryAmount(value: string): string {
  const money = Money.parse(value);
  return (money.compare(Money.parse("0")) < 0 ? money.negate() : money).toWire();
}
