import { implement } from "@orpc/server";
import { appContract } from "@tuari/contracts";
import type { RpcMiddleware } from "../rpc-middleware";
import type { CompanyService } from "../../modules/company/company.service";
import type { InventoryService } from "../../modules/inventory/inventory.service";

export function createReportsHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
  inventoryService: InventoryService,
): Record<string, any> {
  return {
    reportsGenerate: os.reportsGenerate.handler(m.queryAuth(async ({ context, input }: any) => {
      const { type, startDate, endDate } = input;

      switch (type) {
        case "INVENTORY":
          return generateInventoryReport(inventoryService, startDate, endDate);
        case "DEBT":
          return generateDebtReport(companyService, startDate, endDate);
        case "MOVEMENT":
          return generateMovementReport(inventoryService, startDate, endDate);
        default:
          throw new Error(`Unknown report type: ${type}`);
      }
    })),
  };
}

async function generateInventoryReport(
  inventoryService: InventoryService,
  startDate?: string,
  endDate?: string,
) {
  const result = inventoryService.listInvoiceGroups?.();
  const invoiceGroups = result?.items ?? [];

  // Filter by date range if provided
  let filtered = invoiceGroups;
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : new Date('1900-01-01');
    const end = endDate ? new Date(endDate) : new Date('2100-12-31');
    filtered = invoiceGroups.filter(g => {
      const date = g.invoiceDate ? new Date(g.invoiceDate) : new Date(g.createdAt);
      return date >= start && date <= end;
    });
  }

  const totalValueDzd = filtered.reduce((sum: number, group: any) => sum + (group.grossTotalDzd || 0), 0);

  return {
    type: "INVENTORY" as const,
    generatedAt: new Date().toISOString(),
    summary: {
      totalAssetsDzd: 0,
      totalConsumablesDzd: 0,
      totalValueDzd,
    },
    byLocation: [
      {
        locationId: null,
        locationLabel: "جميع المواقع",
        assetCount: 0,
        assetValueDzd: 0,
        consumableCount: 0,
      },
    ],
    byItemType: [],
    agingAnalysis: [
      { ageCategory: "0-30_DAYS" as const, count: 0, valueDzd: 0 },
      { ageCategory: "31-90_DAYS" as const, count: 0, valueDzd: 0 },
      { ageCategory: "90-180_DAYS" as const, count: 0, valueDzd: 0 },
      { ageCategory: "180+_DAYS" as const, count: 0, valueDzd: 0 },
    ],
  };
}

async function generateDebtReport(
  companyService: CompanyService,
  startDate?: string,
  endDate?: string,
) {
  // TODO: Implement real debt aggregation using date range filters
  // For now, return zeroed summary (date filters not yet wired)
  void startDate;
  void endDate;

  return {
    type: "DEBT" as const,
    generatedAt: new Date().toISOString(),
    summary: {
      totalOutstandingDzd: 0,
      totalSettledDzd: 0,
      overdueDzd: 0,
      partyCount: 0,
    },
    agingBreakdown: [
      { ageCategory: "0-30_DAYS" as const, countOpen: 0, amountDzd: 0 },
      { ageCategory: "31-60_DAYS" as const, countOpen: 0, amountDzd: 0 },
      { ageCategory: "60+_DAYS" as const, countOpen: 0, amountDzd: 0 },
    ],
    byParty: [],
    topDebtors: [],
  };
}

async function generateMovementReport(
  inventoryService: InventoryService,
  startDate?: string,
  endDate?: string,
) {
  // TODO: Implement real movement tracking using date range filters
  // For now, return zeroed summary (date filters not yet wired)
  void startDate;
  void endDate;
  void inventoryService;

  return {
    type: "MOVEMENT" as const,
    generatedAt: new Date().toISOString(),
    summary: {
      totalMovements: 0,
      assetTransfers: 0,
      consumableTransfers: 0,
      outboundSales: 0,
    },
    byType: [
      { movementType: "PURCHASE" as const, count: 0, valueDzd: 0 },
      { movementType: "TRANSFER" as const, count: 0, valueDzd: 0 },
      { movementType: "OUTBOUND_SALE" as const, count: 0, valueDzd: 0 },
    ],
    byPeriod: [],
    topDestinations: [],
  };
}
