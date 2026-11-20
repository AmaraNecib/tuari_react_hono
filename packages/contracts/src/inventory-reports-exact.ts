import { z } from "zod";
import { entityIdSchema, timestampSchema } from "./core";

const amount = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
const quantity = z.number().nonnegative();

export const exactInventoryReportSchema = z.object({
  type: z.literal("INVENTORY"), generatedAt: timestampSchema,
  summary: z.object({ totalAssetsDzd: amount, totalConsumablesDzd: amount, totalValueDzd: amount }),
  byLocation: z.array(z.object({ locationId: entityIdSchema.nullable(), locationType: z.enum(["WAREHOUSE", "PROJECT"]).nullable(), locationLabel: z.string().min(1), assetCount: quantity, assetValueDzd: amount, consumableCount: quantity })),
  byItemType: z.array(z.object({ itemName: z.string().min(1), quantity, valueDzd: amount, lastUpdated: timestampSchema })),
  agingAnalysis: z.array(z.object({ ageCategory: z.enum(["0-30_DAYS", "31-90_DAYS", "90-180_DAYS", "180+_DAYS"]), count: quantity, valueDzd: amount })),
});

export const exactMovementReportSchema = z.object({
  type: z.literal("MOVEMENT"), generatedAt: timestampSchema,
  outboundDocuments: z.array(z.object({ transferType: z.enum(["SALE", "RETURN", "GIFT"]), count: quantity })),
  summary: z.object({ totalMovements: quantity, assetTransfers: quantity, consumableTransfers: quantity, outboundSales: quantity }),
  byType: z.array(z.object({ movementType: z.enum(["PURCHASE", "TRANSFER", "OUTBOUND_SALE"]), count: quantity, valueDzd: amount })),
  byPeriod: z.array(z.object({ period: z.string().min(1), count: quantity, valueDzd: amount })),
  topDestinations: z.array(z.object({ destinationLabel: z.string().min(1), receiveCount: quantity, valueDzd: amount })),
});

export const exactInventoryReportsSchema = z.discriminatedUnion("type", [exactInventoryReportSchema, exactMovementReportSchema]);
export type ExactInventoryReport = z.infer<typeof exactInventoryReportSchema>;
export type ExactMovementReport = z.infer<typeof exactMovementReportSchema>;
export type ExactInventoryReports = z.infer<typeof exactInventoryReportsSchema>;
