import { implement } from "@orpc/server";
import type { RpcMiddleware } from "../rpc-middleware";
import type { FinanceService } from "../../modules/company/finance.service";
import type { InventoryService } from "../../modules/inventory/inventory.service";
import type { ReportFilterInput } from "./handler-inputs";

/**
 * Reports RPC handlers — thin dispatchers over the real service aggregations.
 *
 * The aggregation logic lives at the service seams (InventoryService /
 * FinanceService) so the report semantics (date windows, aging buckets,
 * valuation rules) are unit-testable next to the domain they read from; this
 * file only selects the generator and stamps nothing extra — generatedAt
 * comes from the services' own clock for a stable, one-time stamp.
 */
export function createReportsHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  financeService: FinanceService,
  inventoryService: InventoryService,
) {
  return {
    reportsGenerate: os.reportsGenerate.handler(m.queryAuth(async ({ input }) => {
      const { type, startDate, endDate } = input as ReportFilterInput;

      switch (type) {
        case "INVENTORY":
          return inventoryService.generateInventoryReport({ startDate, endDate });
        case "DEBT":
          return financeService.generateDebtReport({ startDate, endDate });
        case "MOVEMENT":
          return inventoryService.generateMovementReport({ startDate, endDate });
        default:
          throw new Error(`Unknown report type: ${type}`);
      }
    })),
  };
}
