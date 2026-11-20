import { ExactLine, Money, Quantity, UnitPrice, parseExactLine, sumExactLineHistory } from "@tuari/contracts";
import { exactInventoryReportSchema, exactMovementReportSchema } from "../../../../../packages/contracts/src/inventory-reports-exact";
import { exactInventoryQuantityText } from "../inventory/inventory-exact-quantity";
import type { ExactInventoryEntryRecord } from "../inventory/inventory-exact.repository";
import { ExactInventoryReportSource } from "./exact-inventory-report-source";

type Filter = { startDate?: string; endDate?: string };
const categories = ["0-30_DAYS", "31-90_DAYS", "90-180_DAYS", "180+_DAYS"] as const;
const quantity = (value: number) => Quantity.inventory(exactInventoryQuantityText(value));
function window(input: Filter, now: string) {
  const bound = (value: string | undefined, end: boolean) => {
    if (!value) return end ? Infinity : -Infinity;
    const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = Date.parse(selectedDay ? `${value}T00:00:00.000+01:00` : value);
    if (!Number.isFinite(parsed) || (selectedDay && new Date(parsed + 3600000).toISOString().slice(0, 10) !== value)) throw new TypeError("Invalid report date");
    return parsed + (selectedDay && end ? 86400000 - 1 : 0);
  };
  const start = bound(input.startDate, false), end = bound(input.endDate, true);
  if (start > end || !Number.isFinite(Date.parse(now))) throw new RangeError("Invalid report window");
  return { includes: (date: string) => { const ms = Date.parse(date); if (!Number.isFinite(ms)) throw new TypeError("Invalid persisted report date"); return ms >= start && ms <= end; }, asOf: Number.isFinite(end) ? end : Date.parse(now) };
}
function sourceValue(entry: ExactInventoryEntryRecord, count: number): ExactLine {
  const source = parseExactLine(entry.priceSource).source;
  const q = quantity(count);
  if (source.mode === "unit-price") return ExactLine.fromPrice(UnitPrice.parse(source.price), q);
  return ExactLine.fromDerived(Money.parse(source.total), Quantity.inventory(source.mode === "derived-price" ? source.originalQuantity : source.quantity), q);
}
const amountLine = (value: string, count = 1) => ExactLine.fromDerived(Money.parse(value), Quantity.inventory("1"), quantity(count));
const total = (rows: { value: ExactLine }[]) => sumExactLineHistory(rows.map(row => row.value));
const locationKey = (warehouse: string | null, project: string | null) => warehouse ? `w:${warehouse}` : project ? `p:${project}` : "unlocated";
function group<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) { const id = key(row); const bucket = result.get(id) ?? []; bucket.push(row); result.set(id, bucket); }
  return [...result.values()];
}
const descendingMoney = (a: string, b: string) => { const left = BigInt(a.replace(".", "")), right = BigInt(b.replace(".", "")); return left > right ? -1 : left < right ? 1 : 0; };

/** Inert readers. Both reports use current stock, never an as-of reconstructed ledger. */
export class ExactInventoryReports {
  constructor(private readonly source: ExactInventoryReportSource, private readonly now: () => string = () => new Date().toISOString()) {}
  generateInventoryReport(input: Filter = {}) {
    const generatedAt = this.now(), range = window(input, generatedAt);
    return this.source.snapshot(data => {
      const entries = new Map(data.entries.map(entry => [entry.id, entry]));
      const groups = new Map(data.groups.map(row => [row.id, row]));
      const metadata = (entryId: string) => {
        const entry = entries.get(entryId); if (!entry) throw new Error("Missing inventory entry source");
        const owner = groups.get(entry.invoiceGroupId); if (!owner) throw new Error("Missing inventory invoice source");
        return { entry, documentDate: owner.invoiceDate ?? owner.createdAt };
      };
      const rows = [
        ...data.assets.map(asset => ({ ...metadata(asset.inventoryEntryId), itemType: "ASSET" as const, count: 1, value: amountLine(asset.purchasePriceDzd), warehouse: asset.currentWarehouseId, project: asset.currentProjectId, updatedAt: asset.updatedAt })),
        ...data.balances.map(balance => { const info = metadata(balance.inventoryEntryId); return { ...info, itemType: "CONSUMABLE" as const, count: balance.quantity, value: sourceValue(info.entry, balance.quantity), warehouse: balance.warehouseId, project: balance.projectId, updatedAt: balance.updatedAt }; }),
      ].filter(row => range.includes(row.documentDate));
      const assets = rows.filter(row => row.itemType === "ASSET"), consumables = rows.filter(row => row.itemType === "CONSUMABLE");
      return exactInventoryReportSchema.parse({ type: "INVENTORY", generatedAt,
        summary: { totalAssetsDzd: total(assets), totalConsumablesDzd: total(consumables), totalValueDzd: total(rows) },
        byLocation: group(rows, row => locationKey(row.warehouse, row.project)).map(bucket => {
          const row = bucket[0]!;
          return { locationId: row.warehouse ?? row.project, locationType: row.warehouse ? "WAREHOUSE" : row.project ? "PROJECT" : null, locationLabel: data.locationLabel(row.warehouse, row.project), assetCount: bucket.filter(row => row.itemType === "ASSET").length, assetValueDzd: total(bucket.filter(row => row.itemType === "ASSET")), consumableCount: bucket.filter(row => row.itemType === "CONSUMABLE").reduce((sum, row) => sum + row.count, 0) };
        }).sort((a, b) => a.locationLabel.localeCompare(b.locationLabel, "ar")),
        byItemType: group(rows, row => row.entry.itemName).map(bucket => ({ itemName: bucket[0]!.entry.itemName, quantity: bucket.reduce((sum, row) => sum + row.count, 0), valueDzd: total(bucket), lastUpdated: bucket.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, bucket[0]!.updatedAt) })).sort((a, b) => descendingMoney(a.valueDzd, b.valueDzd) || a.itemName.localeCompare(b.itemName, "ar")),
        agingAnalysis: categories.map((ageCategory, index) => {
          const bucket = rows.filter(row => { const age = Math.max(0, Math.floor((range.asOf - Date.parse(row.documentDate)) / 86400000)); return (age <= 30 ? 0 : age <= 89 ? 1 : age <= 179 ? 2 : 3) === index; });
          return { ageCategory, count: new Set(bucket.map(row => row.entry.id)).size, valueDzd: total(bucket) };
        }),
      });
    });
  }
  generateMovementReport(input: Filter = {}) {
    const generatedAt = this.now(), range = window(input, generatedAt);
    return this.source.snapshot(data => {
      const entries = new Map(data.entries.map(entry => [entry.id, entry]));
      const assets = new Map(data.assets.map(asset => [asset.id, asset]));
      const rows = data.movements.filter(row => range.includes(row.occurredAt)).map(movement => {
        const entry = entries.get(movement.inventoryEntryId ?? ""), asset = assets.get(movement.assetUnitId ?? "");
        if (movement.itemType === "ASSET" ? !asset : !entry) throw new Error("Missing authoritative movement valuation source");
        return { ...movement, value: asset ? amountLine(asset.purchasePriceDzd, movement.quantity) : sourceValue(entry!, movement.quantity) };
      });
      const types = ["PURCHASE", "TRANSFER", "OUTBOUND_SALE"] as const;
      return exactMovementReportSchema.parse({ type: "MOVEMENT", generatedAt,
        summary: { totalMovements: rows.length, assetTransfers: rows.filter(row => row.movementType === "TRANSFER" && row.itemType === "ASSET").length, consumableTransfers: rows.filter(row => row.movementType === "TRANSFER" && row.itemType === "CONSUMABLE").length, outboundSales: rows.filter(row => row.movementType === "OUTBOUND_SALE").length },
        // These are document counts, not guessed links from outbound movements to documents.
        outboundDocuments: (["SALE", "RETURN", "GIFT"] as const).map(transferType => ({ transferType, count: data.outbounds.filter(row => row.transferType === transferType && range.includes(row.transferDate)).length })),
        byType: types.map(movementType => { const bucket = rows.filter(row => row.movementType === movementType); return { movementType, count: bucket.length, valueDzd: total(bucket) }; }),
        byPeriod: group(rows, row => row.occurredAt.slice(0, 7)).map(bucket => ({ period: bucket[0]!.occurredAt.slice(0, 7), count: bucket.length, valueDzd: total(bucket) })).sort((a, b) => a.period.localeCompare(b.period)),
        topDestinations: group(rows.filter(row => row.toWarehouseId || row.toProjectId), row => locationKey(row.toWarehouseId, row.toProjectId)).map(bucket => ({ destinationLabel: data.locationLabel(bucket[0]!.toWarehouseId, bucket[0]!.toProjectId), receiveCount: bucket.length, valueDzd: total(bucket) })).sort((a, b) => b.receiveCount - a.receiveCount || a.destinationLabel.localeCompare(b.destinationLabel, "ar")).slice(0, 10),
      });
    });
  }
}
