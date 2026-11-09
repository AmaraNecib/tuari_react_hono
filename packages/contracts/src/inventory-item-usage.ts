import { z } from "zod";

import { inventoryItemTypeSchema } from "./core";

/**
 * The item-offer seam: "which item definitions may this surface offer?".
 *
 * Two vocabularies that happened to be equal sets are kept apart on purpose:
 *
 * - {@link inventoryItemKindSchema} is the ROW's intent (what the operator is
 *   adding). The invoice line's kind is an input, not a fact about a definition.
 * - `inventoryItemTypeSchema` (core) is the DEFINITION's fact.
 *
 * Deriving one from the other is exactly the inversion that let a picker
 * rewrite a row's kind from a selection. Separating them makes that
 * unrepresentable and leaves room for a future kind that holds no stock item.
 */
export const inventoryItemKindSchema = z.enum(["CONSUMABLE", "ASSET"]);

/** InventoryItemKind - the row's intended kind. */
export type InventoryItemKind = z.infer<typeof inventoryItemKindSchema>;

/**
 * The location an availability rule is asked about.
 *
 * A transfer's source is exactly one of a warehouse or a project (the schema's
 * XOR destination rule), so the source is a closed union rather than a pair of
 * nullable ids that could both be set.
 */
export const inventoryItemOfferSourceSchema = z.discriminatedUnion("locationType", [
  z.object({
    locationType: z.literal("WAREHOUSE"),
    warehouseId: z.string().min(1),
  }),
  z.object({
    locationType: z.literal("PROJECT"),
    projectId: z.string().min(1),
  }),
]);

/** InventoryItemOfferSource - a location a stock rule is asked about. */
export type InventoryItemOfferSource = z.infer<typeof inventoryItemOfferSourceSchema>;

/**
 * A closed union of every surface that asks for item options.
 *
 * `STOCK_REFERENCE` is the expense dialog's soft reference to a stock item
 * (issue #411): it may reference any active definition. `OUTBOUND_PICK` is the
 * outbound transfer's item list (issue #465): the item is about to leave the
 * business, so it must be active AND hold stock at the chosen source. A new
 * surface must add a member here, which then fails the `never` check in
 * {@link resolveItemOffer} until its rule is stated.
 */
export const inventoryItemUsageSchema = z.discriminatedUnion("surface", [
  z.object({
    surface: z.literal("INVOICE_LINE"),
    kind: inventoryItemKindSchema,
  }),
  z.object({
    surface: z.literal("STOCK_REFERENCE"),
  }),
  z.object({
    surface: z.literal("OUTBOUND_PICK"),
    source: inventoryItemOfferSourceSchema,
  }),
]);

/** InventoryItemUsage - a surface asking for item options. */
export type InventoryItemUsage = z.infer<typeof inventoryItemUsageSchema>;

/**
 * The rule, as data rather than a closure.
 *
 * The same object is compiled to SQL for the paged picker and evaluated in JS
 * at the write gate. A predicate could only run in JS, which would force the
 * picker to filter after paging (unstable page sizes) or the gate to keep its
 * own copy of the rule — the drift this seam exists to remove.
 *
 * Both evaluators serve the outbound write gate as of #450: it reads the stock
 * a definition holds at a source (`listItemStockAtSource`), projects the
 * locations into an {@link ItemOfferCandidate}, and evaluates this rule over it
 * — the same rule the paged picker compiled to SQL, so the two cannot accept
 * different sets at a source.
 */
export type InventoryItemOfferFilter = {
  itemTypes: readonly z.infer<typeof inventoryItemTypeSchema>[];
  activeOnly: boolean;
  /**
   * When set, only definitions that currently hold stock at this location are
   * offered. Absent means the rule does not care about availability.
   *
   * Availability is a fact about (definition, source), not about the definition
   * alone — which is why `{ itemTypes, activeOnly }` could not express it and
   * this field had to be added. BOTH evaluators honour it: the SQL compiler in
   * the inventory repository, and {@link matchesItemOfferFilter} in JS.
   */
  inStockAt?: InventoryItemOfferSource;
};

/** Evidence a definition must satisfy to be offered. */
export type ItemOfferCandidate = {
  itemType: z.infer<typeof inventoryItemTypeSchema>;
  isActive: boolean;
  /** Warehouse ids where this definition currently holds stock. */
  stockWarehouseIds?: readonly string[];
  /** Project ids where this definition currently holds stock. */
  stockProjectIds?: readonly string[];
};

/** Convenience constructor for the invoice-line usage. */
export function invoiceLineUsage(kind: InventoryItemKind): InventoryItemUsage {
  return { surface: "INVOICE_LINE", kind };
}

/** Convenience constructor for the outbound-transfer usage. */
export function outboundPickUsage(source: InventoryItemOfferSource): InventoryItemUsage {
  return { surface: "OUTBOUND_PICK", source };
}

/**
 * Resolves a usage to its offer filter.
 *
 * The `never` exhaustiveness check makes a new surface a compile error at every
 * policy site: it must state its rule before it can ship.
 */
export function resolveItemOffer(usage: InventoryItemUsage): InventoryItemOfferFilter {
  switch (usage.surface) {
    case "INVOICE_LINE":
      // A row of kind K offers only definitions of type K, and never archived
      // ones (the write gate already refuses archived definitions).
      return { itemTypes: [usage.kind], activeOnly: true };
    case "STOCK_REFERENCE":
      // The expense soft reference may point at any active definition.
      return { itemTypes: ["CONSUMABLE", "ASSET"], activeOnly: true };
    case "OUTBOUND_PICK":
      // The item is leaving the business: it must be active and physically
      // present at the source it leaves from.
      return { itemTypes: ["CONSUMABLE", "ASSET"], activeOnly: true, inStockAt: usage.source };
    default: {
      const exhaustive: never = usage;
      return exhaustive;
    }
  }
}

/**
 * Does the definition currently hold stock at this source?
 *
 * The candidate carries the location ids where stock exists; an unknown (or
 * absent) set means the definition is not available there.
 */
function isInStockAt(definition: ItemOfferCandidate, source: InventoryItemOfferSource): boolean {
  return source.locationType === "WAREHOUSE"
    ? (definition.stockWarehouseIds?.includes(source.warehouseId) ?? false)
    : (definition.stockProjectIds?.includes(source.projectId) ?? false);
}

/**
 * The JS evaluator of an offer filter. The SQL compiler in the inventory
 * repository must return the same verdict for the same inputs; the
 * SQL-versus-JS equivalence test pins that.
 */
export function matchesItemOfferFilter(
  filter: InventoryItemOfferFilter,
  definition: ItemOfferCandidate,
): boolean {
  return (
    filter.itemTypes.includes(definition.itemType) &&
    (!filter.activeOnly || definition.isActive) &&
    (!filter.inStockAt || isInStockAt(definition, filter.inStockAt))
  );
}
