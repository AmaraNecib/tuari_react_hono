import { implement, ORPCError } from "@orpc/server";
import type { RpcMiddleware } from "../rpc-middleware";
import type { FinanceService } from "../../modules/company/finance.service";
import type { InventoryService } from "../../modules/inventory/inventory.service";
import type { ReportFilterInput } from "./handler-inputs";

/**
 * Reports refuse an unrepresentable aggregate with a typed domain error
 * (`InventoryError` / `CompanyError`). The report output is a plain
 * discriminated union with no failure branch, so this resolver must rethrow the
 * refusal as a wire error or ORPC would surface it as a generic 500 (#421
 * lesson). ORPC v1 accepts arbitrary string codes, so `appError.code` (e.g.
 * `BUSINESS_RULE`) crosses the wire verbatim. Exported for the
 * resolver-contract test.
 */
export function toReportOrpcError(error: unknown): unknown {
  const appError = (error as { appError?: { code: string; message: string } } | null)?.appError;
  if (appError) {
    return new ORPCError(appError.code, { message: appError.message });
  }
  // A plain error must be THROWN, not returned: `queryAuth` only rethrows a
  // returned `ORPCError`, so returning this would make it the procedure output
  // and `reportSchema` would replace the real failure with an output-validation
  // error (#421 lesson; the resolver contract in rpc-middleware).
  throw error;
}

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
    }, toReportOrpcError)),
  };
}
