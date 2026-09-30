import { describe, expect, it } from "vitest";

import {
  invoiceLineUsage,
  inventoryItemUsageSchema,
  matchesItemOfferFilter,
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
