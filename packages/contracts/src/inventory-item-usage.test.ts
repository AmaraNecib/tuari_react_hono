import { describe, expect, it } from "vitest";

import {
  invoiceLineUsage,
  inventoryItemUsageSchema,
  matchesItemOfferFilter,
  outboundPickUsage,
  resolveItemOffer,
} from "./inventory-item-usage";

const consumableActive = { itemType: "CONSUMABLE" as const, isActive: true };
const consumableArchived = { itemType: "CONSUMABLE" as const, isActive: false };
const assetActive = { itemType: "ASSET" as const, isActive: true };

describe("resolveItemOffer", () => {
  it("offers only the row's own kind for an invoice line", () => {
    expect(resolveItemOffer(invoiceLineUsage("CONSUMABLE"))).toEqual({
      itemTypes: ["CONSUMABLE"],
      activeOnly: true,
    });
    expect(resolveItemOffer(invoiceLineUsage("ASSET"))).toEqual({
      itemTypes: ["ASSET"],
      activeOnly: true,
    });
  });

  it("offers either kind for a stock reference, still excluding archived", () => {
    expect(resolveItemOffer({ surface: "STOCK_REFERENCE" })).toEqual({
      itemTypes: ["CONSUMABLE", "ASSET"],
      activeOnly: true,
    });
  });

  it("keeps the row kind schema separate from the definition type schema", () => {
    expect(inventoryItemUsageSchema.parse({ surface: "INVOICE_LINE", kind: "ASSET" })).toEqual({
      surface: "INVOICE_LINE",
      kind: "ASSET",
    });
    expect(inventoryItemUsageSchema.parse({ surface: "STOCK_REFERENCE" })).toEqual({
      surface: "STOCK_REFERENCE",
    });
    expect(inventoryItemUsageSchema.safeParse({ surface: "UNKNOWN" }).success).toBe(false);
  });
});

describe("outbound pick availability", () => {
  const warehouseSource = { locationType: "WAREHOUSE" as const, warehouseId: "wh-1" };
  const projectSource = { locationType: "PROJECT" as const, projectId: "prj-1" };

  it("resolves the chosen source into the offer filter", () => {
    expect(resolveItemOffer(outboundPickUsage(warehouseSource))).toEqual({
      itemTypes: ["CONSUMABLE", "ASSET"],
      activeOnly: true,
      inStockAt: warehouseSource,
    });
    expect(resolveItemOffer(outboundPickUsage(projectSource))).toEqual({
      itemTypes: ["CONSUMABLE", "ASSET"],
      activeOnly: true,
      inStockAt: projectSource,
    });
  });

  it("rejects an active definition with no stock at the source", () => {
    const filter = resolveItemOffer(outboundPickUsage(warehouseSource));
    expect(matchesItemOfferFilter(filter, { ...consumableActive })).toBe(false);
    expect(matchesItemOfferFilter(filter, { ...consumableActive, stockWarehouseIds: [] })).toBe(false);
  });

  it("rejects stock recorded at a different location", () => {
    const filter = resolveItemOffer(outboundPickUsage(warehouseSource));
    expect(matchesItemOfferFilter(filter, { ...consumableActive, stockWarehouseIds: ["wh-2"] })).toBe(false);
    expect(
      matchesItemOfferFilter(
        resolveItemOffer(outboundPickUsage(projectSource)),
        { ...consumableActive, stockWarehouseIds: ["prj-1"] },
      ),
    ).toBe(false);
  });

  it("accepts an active definition that holds stock at the source", () => {
    const warehouseFilter = resolveItemOffer(outboundPickUsage(warehouseSource));
    expect(matchesItemOfferFilter(warehouseFilter, { ...consumableActive, stockWarehouseIds: ["wh-1"] })).toBe(true);
    expect(matchesItemOfferFilter(warehouseFilter, { ...assetActive, stockWarehouseIds: ["wh-1"] })).toBe(true);

    const projectFilter = resolveItemOffer(outboundPickUsage(projectSource));
    expect(matchesItemOfferFilter(projectFilter, { ...consumableActive, stockProjectIds: ["prj-1"] })).toBe(true);
  });

  it("rejects an archived definition even when it still holds stock at the source", () => {
    expect(
      matchesItemOfferFilter(
        resolveItemOffer(outboundPickUsage(warehouseSource)),
        { ...consumableArchived, stockWarehouseIds: ["wh-1"] },
      ),
    ).toBe(false);
  });

  it("carries the source through the usage schema", () => {
    expect(
      inventoryItemUsageSchema.parse({ surface: "OUTBOUND_PICK", source: projectSource }),
    ).toEqual({ surface: "OUTBOUND_PICK", source: projectSource });
    expect(
      inventoryItemUsageSchema.safeParse({ surface: "OUTBOUND_PICK", source: { locationType: "WAREHOUSE" } }).success,
    ).toBe(false);
    expect(
      inventoryItemUsageSchema.safeParse({ surface: "OUTBOUND_PICK" }).success,
    ).toBe(false);
  });
});

describe("matchesItemOfferFilter", () => {
  it("accepts a definition the filter's item types include", () => {
    expect(
      matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage("CONSUMABLE")), consumableActive),
    ).toBe(true);
  });

  it("rejects a definition of the other type", () => {
    expect(
      matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage("CONSUMABLE")), assetActive),
    ).toBe(false);
    expect(
      matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage("ASSET")), consumableActive),
    ).toBe(false);
  });

  it("rejects an archived definition even when the type matches", () => {
    expect(
      matchesItemOfferFilter(resolveItemOffer(invoiceLineUsage("CONSUMABLE")), consumableArchived),
    ).toBe(false);
  });

  it("matches both types for a stock reference but never an archived one", () => {
    const filter = resolveItemOffer({ surface: "STOCK_REFERENCE" });
    expect(matchesItemOfferFilter(filter, consumableActive)).toBe(true);
    expect(matchesItemOfferFilter(filter, assetActive)).toBe(true);
    expect(matchesItemOfferFilter(filter, consumableArchived)).toBe(false);
  });
});
