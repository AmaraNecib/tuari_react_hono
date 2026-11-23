import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";
import { nonNegativePaymentAmountSchema } from "./payment";

export const reportTypeSchema = z.enum(["INVENTORY", "DEBT", "MOVEMENT"]);
export type ReportType = z.infer<typeof reportTypeSchema>;

/**
 * Report money fields are COMPUTED fresh at read time (a sum across stored
 * rows), so unlike a persisted money column they keep the write bound and
 * refuse to emit a value the safe-integer range cannot represent (#475, the
 * #429/F1=B contrast; `inventoryProjectChargesSchema.totalDzd` is the
 * precedent). Counting fields (counts, quantities) stay unbounded.
 */
export const inventoryReportSchema = z.object({
  type: z.literal("INVENTORY"),
  generatedAt: timestampSchema,
  summary: z.object({
    totalAssetsDzd: nonNegativePaymentAmountSchema,
    totalConsumablesDzd: nonNegativePaymentAmountSchema,
    totalValueDzd: nonNegativePaymentAmountSchema,
  }),
  byLocation: z.array(
    z.object({
      locationId: entityIdSchema.nullable(),
      locationLabel: z.string().min(1),
      assetCount: z.number().nonnegative(),
      assetValueDzd: nonNegativePaymentAmountSchema,
      consumableCount: z.number().nonnegative(),
    })
  ),
  byItemType: z.array(
    z.object({
      itemName: z.string().min(1),
      quantity: z.number().nonnegative(),
      valueDzd: nonNegativePaymentAmountSchema,
      lastUpdated: timestampSchema,
    })
  ),
  agingAnalysis: z.array(
    z.object({
      ageCategory: z.enum(["0-30_DAYS", "31-90_DAYS", "90-180_DAYS", "180+_DAYS"]),
      count: z.number().nonnegative(),
      valueDzd: nonNegativePaymentAmountSchema,
    })
  ),
});

export const debtReportSchema = z.object({
  type: z.literal("DEBT"),
  generatedAt: timestampSchema,
  summary: z.object({
    totalOutstandingDzd: nonNegativePaymentAmountSchema,
    totalSettledDzd: nonNegativePaymentAmountSchema,
    overdueDzd: nonNegativePaymentAmountSchema,
    partyCount: z.number().nonnegative(),
  }),
  agingBreakdown: z.array(
    z.object({
      ageCategory: z.enum(["0-30_DAYS", "31-60_DAYS", "60+_DAYS"]),
      countOpen: z.number().nonnegative(),
      amountDzd: nonNegativePaymentAmountSchema,
    })
  ),
  byParty: z.array(
    z.object({
      partyId: entityIdSchema,
      partyName: z.string().min(1),
      partyType: z.enum(["INTERNAL_WORKER", "EXTERNAL_COUNTERPARTY"]),
      outstandingDzd: nonNegativePaymentAmountSchema,
      settledDzd: nonNegativePaymentAmountSchema,
      lastTransaction: timestampSchema.nullable(),
    })
  ),
  topDebtors: z.array(
    z.object({
      partyName: z.string().min(1),
      amountDzd: nonNegativePaymentAmountSchema,
      daysSinceLastPayment: z.number().nonnegative(),
    })
  ),
});

export const movementReportSchema = z.object({
  type: z.literal("MOVEMENT"),
  generatedAt: timestampSchema,
  summary: z.object({
    totalMovements: z.number().nonnegative(),
    assetTransfers: z.number().nonnegative(),
    consumableTransfers: z.number().nonnegative(),
    outboundSales: z.number().nonnegative(),
  }),
  byType: z.array(
    z.object({
      movementType: z.enum(["PURCHASE", "TRANSFER", "OUTBOUND_SALE"]),
      count: z.number().nonnegative(),
      valueDzd: nonNegativePaymentAmountSchema,
    })
  ),
  byPeriod: z.array(
    z.object({
      period: z.string().min(1), // "2025-01", "Week 1", etc.
      count: z.number().nonnegative(),
      valueDzd: nonNegativePaymentAmountSchema,
    })
  ),
  topDestinations: z.array(
    z.object({
      destinationLabel: z.string().min(1),
      receiveCount: z.number().nonnegative(),
      valueDzd: nonNegativePaymentAmountSchema,
    })
  ),
});

export const reportSchema = z.union([
  inventoryReportSchema,
  debtReportSchema,
  movementReportSchema,
]);

export type InventoryReport = z.infer<typeof inventoryReportSchema>;
export type DebtReport = z.infer<typeof debtReportSchema>;
export type MovementReport = z.infer<typeof movementReportSchema>;
export type Report = z.infer<typeof reportSchema>;
