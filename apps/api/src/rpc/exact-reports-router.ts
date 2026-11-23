import { implement, ORPCError } from "@orpc/server";
import { exactReportSchema, financialContract, type ExactDebtReport, type ExactInventoryReport, type ExactMovementReport } from "@tuari/contracts";
import type { ExactDebtReportReader } from "../modules/reports/exact-debt-report";
import type { ExactInventoryReports } from "../modules/reports/exact-inventory-reports";
import type { RpcContext } from "./context";
import type { RpcMiddleware } from "./rpc-middleware";
import { toReportOrpcError } from "./handlers/reports";

export interface ExactReportCapability {
  generate(input: { type: "DEBT" | "INVENTORY" | "MOVEMENT"; startDate?: string; endDate?: string }): Promise<ExactDebtReport | ExactInventoryReport | ExactMovementReport> | ExactDebtReport | ExactInventoryReport | ExactMovementReport;
}

/** Adapt the root-owned readers without constructing another financial graph. */
export function createExactReportCapability(
  debt: Pick<ExactDebtReportReader, "generate">,
  inventory: Pick<ExactInventoryReports, "generateInventoryReport" | "generateMovementReport">,
): ExactReportCapability {
  return {
    generate(input) {
      switch (input.type) {
        case "DEBT": return debt.generate(input);
        case "INVENTORY": return inventory.generateInventoryReport(input);
        case "MOVEMENT": return inventory.generateMovementReport(input);
      }
    },
  };
}

export function createExactReportsRouter(capability: ExactReportCapability | undefined, middleware: RpcMiddleware) {
  const os = implement(financialContract).$context<RpcContext>();
  return {
    generate: os.reports.generate.handler(middleware.queryAuth(async ({ input }) => {
      if (!capability) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Exact reports composition is not configured" });
      return exactReportSchema.parse(await capability.generate(input));
    }, toReportOrpcError)),
  };
}
