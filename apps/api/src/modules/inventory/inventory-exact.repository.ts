import type { ExactInventoryInvoice, ExactInventoryEntry, ExactInventoryAsset, ExactInventoryCharge, ExactInventoryOutbound, InventoryItemDefinition, InventoryConsumableBalance, InventoryMovement } from "@tuari/contracts";
import type { ExactTransactionParticipant } from "../company/exact-finance.repository";
import type { ExactDebtAudit } from "../company/exact-finance.service";

export type ExactInventoryEntryRecord = Omit<ExactInventoryEntry, "assets">;
export type ExactInventoryChargeRecord = ExactInventoryCharge & ExactDebtAudit;
export interface ExactInventoryRepository extends ExactTransactionParticipant {
  getDefinition(id: string): InventoryItemDefinition | null;
  listDefinitions(): InventoryItemDefinition[];
  warehouseExists(id: string): boolean;
  projectExists(id: string): boolean;
  locationLabel(warehouseId: string | null, projectId: string | null): string;
  getGroup(id: string): ExactInventoryInvoice | null;
  listGroups(): ExactInventoryInvoice[];
  saveGroup(row: ExactInventoryInvoice): void;
  getEntry(id: string): ExactInventoryEntryRecord | null;
  listEntries(groupId?: string): ExactInventoryEntryRecord[];
  saveEntry(row: ExactInventoryEntryRecord): void;
  getAsset(id: string): ExactInventoryAsset | null;
  listAssets(): ExactInventoryAsset[];
  saveAsset(row: ExactInventoryAsset): void;
  listBalances(): InventoryConsumableBalance[];
  saveBalance(row: InventoryConsumableBalance): void;
  deleteBalance(id: string): void;
  listMovements(): InventoryMovement[];
  saveMovement(row: InventoryMovement): void;
  getCharge(id: string): ExactInventoryChargeRecord | null;
  listCharges(): ExactInventoryChargeRecord[];
  saveCharge(row: ExactInventoryChargeRecord): void;
  getOutbound(id: string): ExactInventoryOutbound | null;
  listOutbounds(): ExactInventoryOutbound[];
  saveOutbound(row: ExactInventoryOutbound): void;
}
