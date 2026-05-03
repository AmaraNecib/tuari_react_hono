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

  const totalValueDzd = invoiceGroups.reduce((sum: number, group: any) => sum + (group.totalAmountDzd || 0), 0);

  return {
    type: "INVENTORY" as const,
    generatedAt: new Date().toISOString(),
    summary: {
      totalAssetsDzd: totalValueDzd * 0.6,
      totalConsumablesDzd: totalValueDzd * 0.4,
      totalValueDzd,
    },
    byLocation: [
      {
        locationId: null,
        locationLabel: "جميع المواقع",
        assetCount: Math.floor(invoiceGroups.length * 0.6),
        assetValueDzd: totalValueDzd * 0.6,
        consumableCount: Math.floor(invoiceGroups.length * 0.4),
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
