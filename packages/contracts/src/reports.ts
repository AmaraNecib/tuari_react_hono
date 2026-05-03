import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";

export const reportTypeSchema = z.enum(["INVENTORY", "DEBT", "MOVEMENT"]);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const inventoryReportSchema = z.object({
  type: z.literal("INVENTORY"),
  generatedAt: timestampSchema,
  summary: z.object({
    totalAssetsDzd: z.number().nonnegative(),
    totalConsumablesDzd: z.number().nonnegative(),
    totalValueDzd: z.number().nonnegative(),
  }),
  byLocation: z.array(
    z.object({
      locationId: entityIdSchema.nullable(),
      locationLabel: z.string().min(1),
      assetCount: z.number().nonnegative(),
      assetValueDzd: z.number().nonnegative(),
      consumableCount: z.number().nonnegative(),
    })
  ),
  byItemType: z.array(
    z.object({
      itemName: z.string().min(1),
      quantity: z.number().nonnegative(),
      valueDzd: z.number().nonnegative(),
      lastUpdated: timestampSchema,
    })
  ),
  agingAnalysis: z.array(
    z.object({
      ageCategory: z.enum(["0-30_DAYS", "31-90_DAYS", "90-180_DAYS", "180+_DAYS"]),
      count: z.number().nonnegative(),
      valueDzd: z.number().nonnegative(),
    })
  ),
});

export const debtReportSchema = z.object({
  type: z.literal("DEBT"),
  generatedAt: timestampSchema,
  summary: z.object({
    totalOutstandingDzd: z.number().nonnegative(),
    totalSettledDzd: z.number().nonnegative(),
    overdueDzd: z.number().nonnegative(),
    partyCount: z.number().nonnegative(),
  }),
  agingBreakdown: z.array(
    z.object({
      ageCategory: z.enum(["0-30_DAYS", "31-60_DAYS", "60+_DAYS"]),
      countOpen: z.number().nonnegative(),
      amountDzd: z.number().nonnegative(),
    })
  ),
  byParty: z.array(
    z.object({
      partyId: entityIdSchema,
      partyName: z.string().min(1),
      partyType: z.enum(["INTERNAL_WORKER", "EXTERNAL_COUNTERPARTY"]),
      outstandingDzd: z.number().nonnegative(),
      settledDzd: z.number().nonnegative(),
      lastTransaction: timestampSchema.nullable(),
    })
  ),
  topDebtors: z.array(
    z.object({
      partyName: z.string().min(1),
      amountDzd: z.number().nonnegative(),
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
      valueDzd: z.number().nonnegative(),
    })
  ),
  byPeriod: z.array(
    z.object({
      period: z.string().min(1), // "2025-01", "Week 1", etc.
      count: z.number().nonnegative(),
      valueDzd: z.number().nonnegative(),
    })
  ),
  topDestinations: z.array(
    z.object({
      destinationLabel: z.string().min(1),
      receiveCount: z.number().nonnegative(),
      valueDzd: z.number().nonnegative(),
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
