import { oc } from "@orpc/contract";
import { z } from "zod";
import { reportFilterInputSchema } from "./reports-contract";
import { exactDebtReportSchema } from "./debt-report-exact";
import { exactInventoryReportsSchema } from "./inventory-reports-exact";

export const exactReportSchema = z.discriminatedUnion("type", [exactDebtReportSchema, ...exactInventoryReportsSchema.options]);
export const exactReportsContract = {
  generate: oc.input(reportFilterInputSchema).output(exactReportSchema),
} as const;
