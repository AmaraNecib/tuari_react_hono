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
 * A closed union of every surface that asks for item options.
 *
 * `STOCK_REFERENCE` is the expense dialog's soft reference to a stock item
 * (issue #411): it may reference any active definition. A new surface must add
 * a member here, which then fails the `never` check in
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
 */
export type InventoryItemOfferFilter = {
  itemTypes: readonly z.infer<typeof inventoryItemTypeSchema>[];
  activeOnly: boolean;
};

/** Evidence a definition must satisfy to be offered. */
export type ItemOfferCandidate = {
  itemType: z.infer<typeof inventoryItemTypeSchema>;
  isActive: boolean;
};

/** Convenience constructor for the invoice-line usage. */
export function invoiceLineUsage(kind: InventoryItemKind): InventoryItemUsage {
  return { surface: "INVOICE_LINE", kind };
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
    default: {
      const exhaustive: never = usage;
      return exhaustive;
    }
  }
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
    (!filter.activeOnly || definition.isActive)
  );
}
