import { createHash } from "node:crypto";
import {
  Money, UnitPrice, Quantity, ExactLine, finalizeLines, parseExactLine, sumMoney, sumMoneyHistory, sumExactLineHistory, sumMoneyReports,
  exactInventoryInvoiceCreateSchema, exactInventoryPaymentSchema, exactInventoryOutboundPaymentSchema, exactInventoryAssetTransferSchema, exactInventoryChargeUpdateSchema, exactInventoryChargeVoidSchema, exactInventoryOutboundCreateSchema, exactInventoryConsumableTransferSchema,
  invoiceLineUsage, outboundPickUsage, matchesItemOfferFilter, resolveItemOffer,
  type ExactInventoryInvoiceInput, type ExactInventoryPayment, type ExactInventoryOutboundPayment, type ExactInventoryInvoice, type ExactInventoryAsset,
  type ExactInventoryAssetTransfer, type ExactInventoryChargeUpdate, type ExactInventoryChargeVoid, type ExactInventoryOutboundInput, type ExactInventoryOutbound, type ExactInventoryConsumableTransfer,
  type InventoryMovement, type InventoryConsumableBalance,
} from "@tuari/contracts";
import { ExactDebtError, ExactFinanceService, type ExactDebtAudit } from "../company/exact-finance.service";
import { roundQuantity, subtractQuantity, addQuantity, quantityDifferenceMatches, QUANTITY_MIN } from "./inventory.helpers";
import { exactInventoryQuantityText as quantityText } from "./inventory-exact-quantity";
import type { ExactInventoryRepository, ExactInventoryEntryRecord } from "./inventory-exact.repository";

const zero = () => Money.parse("0");
const auditOf = (audit: ExactDebtAudit) => ({ actorUserId: audit.actorUserId ?? null, actorLabel: audit.actorLabel ?? null, transactionId: audit.transactionId ?? null });
const request = (root: string, kind: string, id: string) => `inventory:${createHash("sha256").update(JSON.stringify([root, kind, id])).digest("hex")}`;
function quantity(value: number): number {
  const normalized = roundQuantity(value);
  if (!Number.isFinite(normalized) || normalized <= 0) throw new ExactDebtError("Inventory quantity must be positive at six decimal places");
  return normalized;
}
/** Percentages are independent numeric inputs, never a monetary Number conversion. */
function percentText(value: number): string {
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [coefficient, exponent = "0"] = text.toLowerCase().split("e");
  const [whole = "0", fraction = ""] = coefficient!.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  return point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
}

function percentagePayment(gross: Money, percent: number): Money {
  // Even the maximum supported gross times a percentage below 1e-18 is
  // less than half a cent. This also handles subnormal numeric percentages.
  if (percent < 1e-18) return zero();
  const [whole = "0", fraction = ""] = percentText(percent).split(".");
  const numerator = (whole + fraction).replace(/^0+(?=\d)/, "");
  const denominator = `1${"0".repeat(fraction.length + 2)}`;
  return finalizeLines([ExactLine.fromDerived(gross, Quantity.parse(denominator), Quantity.parse(numerator))]);
}

/** Exact purchase/stock composition; production InventoryService remains numeric. */
export class ExactInventoryService {
  constructor(private readonly repo: ExactInventoryRepository, private readonly finance: ExactFinanceService, private readonly dependencies: { id(): string; now(): string }) {}
  private destination(warehouseId: string | null, projectId: string | null): void {
    if (Boolean(warehouseId) === Boolean(projectId)) throw new ExactDebtError("Choose exactly one inventory destination");
    if (warehouseId && !this.repo.warehouseExists(warehouseId)) throw new ExactDebtError("Warehouse not found", "NOT_FOUND");
    if (projectId && !this.repo.projectExists(projectId)) throw new ExactDebtError("Project not found", "NOT_FOUND");
  }
  listDefinitions() { return this.repo.listDefinitions(); }
  listInvoiceGroups() { return this.repo.listGroups(); }
  listOutboundTransfers() { return this.repo.withTransaction(() => this.repo.listOutbounds().map(row => this.getOutboundTransfer(row.id))); }
  getOutboundTransfer(id: string) {
    const row = this.repo.getOutbound(id);
    if (!row) throw new ExactDebtError("Outbound transfer not found", "NOT_FOUND");
    return { ...row, remainingDebtDzd: row.debtEntryId ? this.finance.remaining(row.debtEntryId) : "0.00" };
  }
  getInvoiceGroup(id: string) {
    const group = this.repo.getGroup(id);
    if (!group) throw new ExactDebtError("Inventory invoice not found", "NOT_FOUND");
    const entries = this.repo.listEntries(id).map(row => ({ ...row, assets: this.repo.listAssets().filter(asset => asset.inventoryEntryId === row.id) }));
    const ids = new Set(entries.map(row => row.id));
    return { group, entries, consumableBalances: this.repo.listBalances().filter(row => ids.has(row.inventoryEntryId)), movements: this.repo.listMovements().filter(row => row.inventoryEntryId && ids.has(row.inventoryEntryId)) };
  }
  createInvoiceGroup(raw: ExactInventoryInvoiceInput & ExactDebtAudit) {
    const input = exactInventoryInvoiceCreateSchema.parse(raw);
    const owner = { type: "INVENTORY_PURCHASE" as const, id: request(input.requestId, "new-group", "") };
    return this.finance.runAggregate({ requestId: input.requestId, producer: owner, intent: { kind: "purchase", input }, ...auditOf(raw) }, this.repo, () => {
      if (input.warehouseId && input.projectId) throw new ExactDebtError("Choose one default inventory destination");
      if (input.warehouseId && !this.repo.warehouseExists(input.warehouseId)) throw new ExactDebtError("Warehouse not found", "NOT_FOUND");
      if (input.projectId && !this.repo.projectExists(input.projectId)) throw new ExactDebtError("Project not found", "NOT_FOUND");
      if (input.externalCounterpartyId) this.finance.requireParty("EXTERNAL_COUNTERPARTY", input.externalCounterpartyId);
      const now = this.dependencies.now();
      const groupId = this.dependencies.id();
      const prepared = input.entries.map(entry => {
        const definition = this.repo.getDefinition(entry.itemDefinitionId);
        if (!definition || !matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage(entry.kind)), definition)) throw new ExactDebtError("Active item definition must match the invoice line kind");
        const warehouseId = entry.warehouseId ?? (entry.projectId ? null : input.warehouseId ?? null);
        const projectId = entry.projectId ?? (entry.warehouseId ? null : input.projectId ?? null);
        this.destination(warehouseId, projectId);
        const id = this.dependencies.id();
        const count = entry.kind === "CONSUMABLE" ? quantity(entry.quantity) : entry.assets.length;
        const q = Quantity.inventory(quantityText(count));
        const total = entry.kind === "ASSET" ? Money.parse(sumMoney(entry.assets.map(asset => Money.parse(asset.purchasePriceDzd)))) : null;
        const source = entry.kind === "CONSUMABLE" ? entry.priceSource ? parseExactLine(entry.priceSource) : ExactLine.fromPrice(UnitPrice.parse(entry.unitPriceDzd!), q) : ExactLine.fromDerived(total!, q, q);
        if (source.source.quantity !== q.toWire()) throw new ExactDebtError("Purchase source quantity must match normalized stock quantity");
        const row: ExactInventoryEntryRecord = { id, invoiceGroupId: groupId, itemDefinitionId: definition.id, warehouseId, projectId,
          itemType: entry.kind, itemName: definition.name, unit: definition.unit, quantity: count,
          unitPriceDzd: source.source.mode === "unit-price" ? source.source.price : null, priceSource: source.toJSON(),
          note: entry.note ?? null, createdAt: now, updatedAt: now };
        const assets: ExactInventoryAsset[] = entry.kind === "ASSET" ? entry.assets.map(asset => ({
          id: this.dependencies.id(), inventoryEntryId: id, itemDefinitionId: definition.id, assetName: asset.assetName, assetTag: asset.assetTag ?? null,
          serialNumber: asset.serialNumber ?? null, condition: asset.condition ?? null, purchaseDate: asset.purchaseDate ?? null,
          purchasePriceDzd: asset.purchasePriceDzd, currentWarehouseId: warehouseId, currentProjectId: projectId,
          currentLocationLabel: this.repo.locationLabel(warehouseId, projectId), note: asset.note ?? null, createdAt: now, updatedAt: now,
        })) : [];
        return { row, source, assets };
      });
      const gross = finalizeLines(prepared.map(line => line.source));
      const paid = !input.createDebt ? gross : input.paymentInputType === "PERCENT"
        ? percentagePayment(gross, input.paidPercent ?? 0)
        : Money.parse(input.paidAmountDzd ?? "0");
      if (paid.compare(gross) > 0) throw new ExactDebtError("First payment exceeds purchase total");
      const group: ExactInventoryInvoice = { id: groupId, invoiceNumber: input.invoiceNumber ?? `IN-${String(this.repo.listGroups().length + 1).padStart(5, "0")}`,
        supplierName: input.supplierName ?? null, invoiceDate: input.invoiceDate ?? now, warehouseId: input.warehouseId ?? null, projectId: input.projectId ?? null,
        externalCounterpartyId: input.externalCounterpartyId ?? null, currency: input.currency, grossTotalDzd: gross.toWire(), paidAmountDzd: paid.toWire(), remainingDebtDzd: gross.subtract(paid).toWire(),
        debtAccountId: null, debtEntryId: null, note: input.note ?? null, createdAt: now, updatedAt: now };
      this.repo.saveGroup(group);
      for (const preparedLine of prepared) {
        const { row, assets } = preparedLine;
        this.repo.saveEntry(row);
        if (row.itemType === "CONSUMABLE") {
          const balance: InventoryConsumableBalance = { id: this.dependencies.id(), inventoryEntryId: row.id, itemDefinitionId: row.itemDefinitionId, itemName: row.itemName,
            warehouseId: row.warehouseId, projectId: row.projectId, quantity: row.quantity, locationLabel: this.repo.locationLabel(row.warehouseId, row.projectId), createdAt: now, updatedAt: now };
          this.repo.saveBalance(balance);
          this.movement({ movementType: "PURCHASE", itemType: "CONSUMABLE", inventoryEntryId: row.id, quantity: row.quantity, toWarehouseId: row.warehouseId, toProjectId: row.projectId, occurredAt: group.invoiceDate! });
        }
        for (const asset of assets) {
          this.repo.saveAsset(asset);
          const movement = this.movement({ movementType: "PURCHASE", itemType: "ASSET", inventoryEntryId: row.id, assetUnitId: asset.id, quantity: 1,
            toWarehouseId: row.warehouseId, toProjectId: row.projectId, occurredAt: group.invoiceDate! });
          if (row.projectId) this.placementCharge(asset.id, row.projectId, movement.id, asset.purchasePriceDzd, raw);
        }
      }
      if (input.createDebt && gross.compare(zero()) > 0) {
        const port = this.finance.forProducer({ type: "INVENTORY_PURCHASE", id: group.id });
        const account = port.createAccount({ requestId: request(input.requestId, "account", group.id), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: input.externalCounterpartyId!, direction: "PAYABLE", ...auditOf(raw) });
        const original = port.postEntry({ requestId: request(input.requestId, "original", group.id), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: gross.toWire(), ...auditOf(raw) });
        group.debtAccountId = account.id; group.debtEntryId = original.id;
        if (paid.compare(zero()) > 0) port.recordPayment({ requestId: request(input.requestId, "first-payment", group.id), debtEntryId: original.id, amountDzd: paid.toWire(), ...auditOf(raw) });
        this.repo.saveGroup(group);
      }
      return this.getInvoiceGroup(group.id);
    });
  }
  recordInvoicePayment(raw: ExactInventoryPayment & ExactDebtAudit) {
    const input = exactInventoryPaymentSchema.parse(raw);
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "INVENTORY_PURCHASE", id: input.invoiceGroupId }, intent: { kind: "purchase-payment", input }, ...auditOf(raw) }, this.repo, () => {
      const group = this.getInvoiceGroup(input.invoiceGroupId).group;
      if (!group.debtEntryId) throw new ExactDebtError("Purchase has no original obligation");
      if (this.finance.remaining(group.debtEntryId) !== group.remainingDebtDzd) throw new ExactDebtError("Purchase and debt disagree", "CONFLICT");
      this.finance.forProducer({ type: "INVENTORY_PURCHASE", id: group.id }).recordPayment({ requestId: request(input.requestId, "payment", group.id), debtEntryId: group.debtEntryId, amountDzd: input.amountDzd, note: input.note, ...auditOf(raw) });
      const amount = Money.parse(input.amountDzd);
      const next = { ...group, paidAmountDzd: Money.parse(group.paidAmountDzd).add(amount).toWire(), remainingDebtDzd: Money.parse(group.remainingDebtDzd).subtract(amount).toWire(), updatedAt: this.dependencies.now() };
      this.repo.saveGroup(next);
      return next;
    });
  }
  getLocationContents(input: { warehouseId?: string | null; projectId?: string | null }) {
    return this.repo.withTransaction(() => {
      const warehouseId = input.warehouseId ?? null;
      const projectId = input.projectId ?? null;
      this.destination(warehouseId, projectId);
      return { assets: this.repo.listAssets().filter(row => row.currentWarehouseId === warehouseId && row.currentProjectId === projectId),
        consumables: this.repo.listBalances().filter(row => row.warehouseId === warehouseId && row.projectId === projectId) };
    });
  }
  transferConsumable(raw: ExactInventoryConsumableTransfer & ExactDebtAudit) {
    const input = exactInventoryConsumableTransferSchema.parse(raw);
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "INVENTORY_TRANSFER", id: input.inventoryEntryId }, intent: { kind: "consumable-transfer", input }, ...auditOf(raw) }, this.repo, () => {
      const count = quantity(input.quantity);
      const fromWarehouseId = input.fromWarehouseId ?? null;
      const fromProjectId = input.fromProjectId ?? null;
      const toWarehouseId = input.toWarehouseId ?? null;
      const toProjectId = input.toProjectId ?? null;
      this.destination(fromWarehouseId, fromProjectId); this.destination(toWarehouseId, toProjectId);
      if (fromWarehouseId === toWarehouseId && fromProjectId === toProjectId) throw new ExactDebtError("Stock source and destination must differ");
      const entry = this.repo.getEntry(input.inventoryEntryId);
      if (!entry || entry.itemType !== "CONSUMABLE") throw new ExactDebtError("Consumable entry not found", "NOT_FOUND");
      const source = this.repo.listBalances().find(row => row.inventoryEntryId === entry.id && row.warehouseId === fromWarehouseId && row.projectId === fromProjectId);
      if (!source || source.quantity < count) throw new ExactDebtError("Requested stock quantity is not available at source");
      const before = roundQuantity(source.quantity);
      const remaining = roundQuantity(subtractQuantity(before, count));
      if (!Number.isFinite(remaining) || remaining < 0 || !quantityDifferenceMatches(before, remaining, count)) throw new ExactDebtError("Cannot represent stock quantity deduction");
      if (remaining === 0) this.repo.deleteBalance(source.id); else this.repo.saveBalance({ ...source, quantity: remaining, updatedAt: this.dependencies.now() });
      const target = this.repo.listBalances().find(row => row.inventoryEntryId === entry.id && row.warehouseId === toWarehouseId && row.projectId === toProjectId);
      if (target) {
        const previous = roundQuantity(target.quantity);
        const next = roundQuantity(addQuantity(previous, count));
        if (!Number.isFinite(next) || !quantityDifferenceMatches(next, previous, count)) throw new ExactDebtError("Cannot represent stock quantity addition");
        this.repo.saveBalance({ ...target, quantity: next, updatedAt: this.dependencies.now() });
      } else this.repo.saveBalance({ id: this.dependencies.id(), inventoryEntryId: entry.id, itemDefinitionId: entry.itemDefinitionId, itemName: entry.itemName,
        warehouseId: toWarehouseId, projectId: toProjectId, quantity: count, locationLabel: this.repo.locationLabel(toWarehouseId, toProjectId), createdAt: this.dependencies.now(), updatedAt: this.dependencies.now() });
      this.movement({ movementType: "TRANSFER", itemType: "CONSUMABLE", inventoryEntryId: entry.id, quantity: count, fromWarehouseId, fromProjectId, toWarehouseId, toProjectId, occurredAt: input.occurredAt ?? this.dependencies.now(), note: input.note ?? null });
      return this.getLocationContents({ warehouseId: toWarehouseId, projectId: toProjectId });
    });
  }
  createOutboundTransfer(raw: ExactInventoryOutboundInput & ExactDebtAudit): ExactInventoryOutbound {
    const input = exactInventoryOutboundCreateSchema.parse(raw);
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "INVENTORY_OUTBOUND", id: request(input.requestId, "new-outbound", "") }, intent: { kind: "outbound", input }, ...auditOf(raw) }, this.repo, () => {
      const warehouseId = input.fromType === "WAREHOUSE" ? input.fromId : null;
      const projectId = input.fromType === "PROJECT" ? input.fromId : null;
      this.destination(warehouseId, projectId);
      this.finance.requireParty("EXTERNAL_COUNTERPARTY", input.counterpartyId);
      const gross = Money.parse(input.debtAmountDzd ?? "0");
      const paid = Money.parse(input.firstPaymentAmountDzd ?? "0");
      if (paid.compare(gross) > 0) throw new ExactDebtError("First payment exceeds agreed outbound amount");
      if (input.transferType === "GIFT" && gross.compare(zero()) > 0) throw new ExactDebtError("A gift cannot create debt");
      const now = this.dependencies.now();
      const transfer: ExactInventoryOutbound = { id: this.dependencies.id(), transferDate: now, fromType: input.fromType, fromId: input.fromId, counterpartyId: input.counterpartyId,
        transferType: input.transferType, status: "COMPLETED", associatedDebtAccountId: null, debtEntryId: null, initialPaymentEntryId: null,
        currency: input.currency, notes: input.notes ?? null, createdAt: now, updatedAt: now, items: [], ...auditOf(raw) };
      const source = input.fromType === "WAREHOUSE" ? { locationType: "WAREHOUSE" as const, warehouseId: input.fromId } : { locationType: "PROJECT" as const, projectId: input.fromId };
      for (const item of input.items) {
        const count = quantity(item.quantity);
        const definition = this.repo.getDefinition(item.itemId);
        if (!definition) throw new ExactDebtError("Inventory definition not found", "NOT_FOUND");
        const balances = this.repo.listBalances().filter(row => row.itemDefinitionId === definition.id && row.warehouseId === warehouseId && row.projectId === projectId && row.quantity >= QUANTITY_MIN)
          .sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        const assets = this.repo.listAssets().filter(row => row.itemDefinitionId === definition.id && row.currentWarehouseId === warehouseId && row.currentProjectId === projectId)
          .sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        const candidate = { itemType: definition.itemType, isActive: definition.isActive,
          stockWarehouseIds: [...balances.flatMap(row => row.warehouseId ? [row.warehouseId] : []), ...assets.flatMap(row => row.currentWarehouseId ? [row.currentWarehouseId] : [])],
          stockProjectIds: [...balances.flatMap(row => row.projectId ? [row.projectId] : []), ...assets.flatMap(row => row.currentProjectId ? [row.currentProjectId] : [])] };
        if (!matchesItemOfferFilter(resolveItemOffer(outboundPickUsage(source)), candidate)) throw new ExactDebtError("Item stock is not available at the selected source");
        if (definition.itemType === "CONSUMABLE") {
          let remaining = count;
          for (const balance of item.optionId ? balances.filter(row => row.id === item.optionId) : balances) {
            if (remaining <= 0) break;
            const before = roundQuantity(balance.quantity);
            const consumed = roundQuantity(Math.min(before, remaining));
            const left = roundQuantity(subtractQuantity(before, consumed));
            const next = roundQuantity(subtractQuantity(remaining, consumed));
            if (!Number.isFinite(left) || !Number.isFinite(next) || left < 0 || next < 0 || left >= before || next >= remaining || !quantityDifferenceMatches(before, left, consumed) || !quantityDifferenceMatches(remaining, next, consumed)) throw new ExactDebtError("Cannot represent the requested stock quantity delta");
            if (left === 0) this.repo.deleteBalance(balance.id); else this.repo.saveBalance({ ...balance, quantity: left, updatedAt: now });
            this.movement({ movementType: "OUTBOUND_SALE", itemType: "CONSUMABLE", inventoryEntryId: balance.inventoryEntryId, quantity: consumed,
              fromWarehouseId: warehouseId, fromProjectId: projectId, occurredAt: now, note: input.notes ?? null });
            remaining = next;
          }
          if (remaining > 0) throw new ExactDebtError("Requested quantity is not available in selected stock");
        } else {
          if (!Number.isInteger(count)) throw new ExactDebtError("Asset quantity must be a whole count");
          const selected = (item.optionId ? assets.filter(row => row.id === item.optionId) : assets).slice(0, count);
          if (selected.length !== count) throw new ExactDebtError("Requested assets are not available at the selected source");
          for (const asset of selected) {
            this.repo.saveAsset({ ...asset, currentWarehouseId: null, currentProjectId: null, currentLocationLabel: null, updatedAt: now });
            this.movement({ movementType: "OUTBOUND_SALE", itemType: "ASSET", inventoryEntryId: asset.inventoryEntryId, assetUnitId: asset.id, quantity: 1,
              fromWarehouseId: warehouseId, fromProjectId: projectId, occurredAt: now, note: input.notes ?? null });
          }
        }
        const q = Quantity.inventory(quantityText(count));
        const priceSource = item.unitPriceDzd !== undefined ? ExactLine.fromPrice(UnitPrice.parse(item.unitPriceDzd), q).toJSON()
          : item.derivedPrice ? ExactLine.fromDerived(Money.parse(item.derivedPrice.total), Quantity.inventory(item.derivedPrice.originalQuantity), q).toJSON() : null;
        transfer.items.push({ id: this.dependencies.id(), itemId: item.itemId, optionId: item.optionId ?? null, quantity: count,
          unitPriceDzd: item.unitPriceDzd ?? null, priceSource, createdAt: now });
      }
      this.repo.saveOutbound(transfer);
      if (gross.compare(zero()) > 0) {
        const port = this.finance.forProducer({ type: "INVENTORY_OUTBOUND", id: transfer.id });
        const account = port.createAccount({ requestId: request(input.requestId, "account", transfer.id), partyType: "EXTERNAL_COUNTERPARTY", externalCounterpartyId: input.counterpartyId, direction: input.transferType === "RETURN" ? "PAYABLE" : "RECEIVABLE", ...auditOf(raw) });
        const original = port.postEntry({ requestId: request(input.requestId, "original", transfer.id), debtAccountId: account.id, entryType: "ADJUSTMENT", signedAmountDzd: gross.toWire(), ...auditOf(raw) });
        transfer.associatedDebtAccountId = account.id; transfer.debtEntryId = original.id;
        if (paid.compare(zero()) > 0) transfer.initialPaymentEntryId = port.recordPayment({ requestId: request(input.requestId, "first-payment", transfer.id), debtEntryId: original.id, amountDzd: paid.toWire(), ...auditOf(raw) }).id;
        this.repo.saveOutbound(transfer);
      }
      return transfer;
    });
  }
  recordOutboundPayment(raw: ExactInventoryOutboundPayment & ExactDebtAudit) {
    const input = exactInventoryOutboundPaymentSchema.parse(raw);
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "INVENTORY_OUTBOUND", id: input.transferId }, intent: { kind: "outbound-payment", input }, ...auditOf(raw) }, this.repo, () => {
      const transfer = this.getOutboundTransfer(input.transferId);
      if (!transfer.debtEntryId) throw new ExactDebtError("Outbound has no original obligation");
      this.finance.forProducer({ type: "INVENTORY_OUTBOUND", id: transfer.id }).recordPayment({ requestId: request(input.requestId, "payment", transfer.id), debtEntryId: transfer.debtEntryId, amountDzd: input.amountDzd, note: input.note, ...auditOf(raw) });
      this.repo.saveOutbound({ ...transfer, updatedAt: this.dependencies.now() });
      return this.getOutboundTransfer(transfer.id);
    });
  }
  getProjectContribution(projectId: string) {
    return this.repo.withTransaction(() => {
      if (!this.repo.projectExists(projectId)) throw new ExactDebtError("Project not found", "NOT_FOUND");
      const movements = this.repo.listMovements().filter(row => row.itemType === "CONSUMABLE" && (row.toProjectId === projectId || row.fromProjectId === projectId));
      const sources = movements.map(row => {
        const entry = row.inventoryEntryId ? this.repo.getEntry(row.inventoryEntryId) : null;
        if (!entry) throw new ExactDebtError("Material movement has no attributable purchase source", "CONFLICT");
        const source = entry.priceSource;
        const signedQuantity = Quantity.inventory(`${row.fromProjectId === projectId ? "-" : ""}${quantityText(row.quantity)}`);
        return source.mode === "unit-price" ? ExactLine.fromPrice(UnitPrice.parse(source.price), signedQuantity)
          : ExactLine.fromDerived(Money.parse(source.total), Quantity.inventory(source.mode === "derived-price" ? source.originalQuantity : source.quantity), signedQuantity);
      });
      const chargedMaterialsDzd = sumExactLineHistory(sources);
      const equipmentChargesDzd = this.getProjectCharges(projectId).totalDzd;
      const parkedAssets = this.repo.listAssets().filter(row => row.currentProjectId === projectId);
      return { projectId, chargedMaterialsDzd, equipmentChargesDzd,
        totalDzd: sumMoneyReports([chargedMaterialsDzd, equipmentChargesDzd]),
        parkedAssetValueDzd: sumMoneyHistory(parkedAssets.map(row => Money.parse(row.purchasePriceDzd))),
        parkedAssets, materialMovements: movements };
    });
  }
  getProjectCharges(projectId: string) {
    if (!this.repo.projectExists(projectId)) throw new ExactDebtError("Project not found", "NOT_FOUND");
    const charges = this.repo.listCharges().filter(row => row.projectId === projectId);
    return { projectId, charges, totalDzd: sumMoneyHistory(charges.filter(row => row.status === "LIVE").map(row => Money.parse(row.amountDzd))) };
  }
  getAssetChargeDefault(assetUnitId: string) {
    const asset = this.repo.getAsset(assetUnitId);
    if (!asset) throw new ExactDebtError("Asset not found", "NOT_FOUND");
    const last = this.repo.listCharges().filter(row => row.assetUnitId === asset.id && row.status === "LIVE").sort((a, b) => b.placementSequence - a.placementSequence)[0];
    return { assetUnitId, amountDzd: last?.amountDzd ?? asset.purchasePriceDzd, purchasePriceDzd: asset.purchasePriceDzd, source: last ? "LAST_CHARGE" as const : "PURCHASE_PRICE" as const };
  }
  transferAsset(raw: ExactInventoryAssetTransfer & ExactDebtAudit): ExactInventoryAsset {
    const input = exactInventoryAssetTransferSchema.parse(raw);
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "INVENTORY_TRANSFER", id: input.assetUnitId }, intent: { kind: "asset-transfer", input: { ...input, chargeAmountDzd: input.chargeAmountDzd ?? null } }, ...auditOf(raw) }, this.repo, () => {
      const warehouseId = input.toWarehouseId ?? null;
      const projectId = input.toProjectId ?? null;
      this.destination(warehouseId, projectId);
      const asset = this.repo.getAsset(input.assetUnitId);
      if (!asset) throw new ExactDebtError("Asset not found", "NOT_FOUND");
      if (!asset.currentWarehouseId && !asset.currentProjectId) throw new ExactDebtError("Externally transferred asset is not available at an internal source");
      if (asset.currentWarehouseId === warehouseId && asset.currentProjectId === projectId) throw new ExactDebtError("Asset is already at destination");
      const next = { ...asset, currentWarehouseId: warehouseId, currentProjectId: projectId, currentLocationLabel: this.repo.locationLabel(warehouseId, projectId), updatedAt: this.dependencies.now() };
      this.repo.saveAsset(next);
      const movement = this.movement({ movementType: "TRANSFER", itemType: "ASSET", inventoryEntryId: asset.inventoryEntryId, assetUnitId: asset.id, quantity: 1,
        fromWarehouseId: asset.currentWarehouseId, fromProjectId: asset.currentProjectId, toWarehouseId: warehouseId, toProjectId: projectId, note: input.note ?? null, occurredAt: input.occurredAt ?? this.dependencies.now() });
      if (projectId) this.placementCharge(asset.id, projectId, movement.id, input.chargeAmountDzd ?? this.getAssetChargeDefault(asset.id).amountDzd, raw);
      return next;
    });
  }
  updateAssetCharge(raw: ExactInventoryChargeUpdate & ExactDebtAudit) {
    const input = exactInventoryChargeUpdateSchema.parse(raw);
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "INVENTORY_CHARGE", id: input.chargeId }, intent: { kind: "correct-charge", input }, ...auditOf(raw) }, this.repo, () => {
      const charge = this.repo.getCharge(input.chargeId);
      if (!charge) throw new ExactDebtError("Charge not found", "NOT_FOUND");
      if (charge.status !== "LIVE") throw new ExactDebtError("Voided charges cannot be corrected");
      if (charge.revisions.length >= 100000) throw new ExactDebtError("Charge revision resource limit exceeded");
      charge.revisions.push({ id: this.dependencies.id(), chargeId: charge.id, previousAmountDzd: charge.amountDzd, newAmountDzd: input.amountDzd,
        revisionSequence: charge.revisions.length + 1, reason: input.reason?.trim() || null, ...auditOf(raw), createdAt: this.dependencies.now() });
      charge.amountDzd = input.amountDzd;
      charge.updatedAt = this.dependencies.now();
      this.repo.saveCharge(charge);
      return charge;
    });
  }
  voidAssetCharge(raw: ExactInventoryChargeVoid & ExactDebtAudit) {
    const input = exactInventoryChargeVoidSchema.parse(raw);
    return this.finance.runAggregate({ requestId: input.requestId, producer: { type: "INVENTORY_CHARGE", id: input.chargeId }, intent: { kind: "void-charge", input }, ...auditOf(raw) }, this.repo, () => {
      const charge = this.repo.getCharge(input.chargeId);
      if (!charge) throw new ExactDebtError("Charge not found", "NOT_FOUND");
      if (charge.status !== "LIVE") throw new ExactDebtError("Charge is already voided");
      if (charge.revisions.length >= 100000) throw new ExactDebtError("Charge revision resource limit exceeded");
      const now = this.dependencies.now();
      charge.revisions.push({ id: this.dependencies.id(), chargeId: charge.id, previousAmountDzd: charge.amountDzd, newAmountDzd: null,
        revisionSequence: charge.revisions.length + 1, reason: input.reason?.trim() || null, ...auditOf(raw), createdAt: now });
      charge.status = "VOID"; charge.voidedAt = now; charge.voidReason = input.reason?.trim() || null; charge.voidedBy = raw.actorLabel ?? raw.actorUserId ?? null; charge.updatedAt = now;
      this.repo.saveCharge(charge);
      return charge;
    });
  }
  private movement(input: Pick<InventoryMovement, "movementType" | "itemType" | "quantity" | "occurredAt"> & Partial<InventoryMovement>): InventoryMovement {
    const row: InventoryMovement = { id: this.dependencies.id(), inventoryEntryId: null, assetUnitId: null, fromWarehouseId: null, fromProjectId: null, toWarehouseId: null, toProjectId: null, note: null, createdAt: this.dependencies.now(), ...input };
    this.repo.saveMovement(row);
    return row;
  }
  private placementCharge(assetUnitId: string, projectId: string, movementId: string, amountDzd: string, audit: ExactDebtAudit): void {
    const now = this.dependencies.now();
    const previous = this.repo.listCharges().filter(row => row.assetUnitId === assetUnitId);
    const placementSequence = previous.reduce((last, row) => Math.max(last, row.placementSequence), 0) + 1;
    if (placementSequence > 100000) throw new ExactDebtError("Asset placement resource limit exceeded");
    this.repo.saveCharge({ id: this.dependencies.id(), assetUnitId, projectId, projectName: this.repo.locationLabel(null, projectId), movementId, amountDzd, placementSequence,
      status: "LIVE", voidedAt: null, voidReason: null, voidedBy: null, revisions: [], createdAt: now, updatedAt: now, ...auditOf(audit) });
  }
}
