import { oc } from "@orpc/contract";
import { z } from "zod";
import { reportSchema, reportTypeSchema } from "./reports";

const reportFilterInputSchema = z.object({
  type: reportTypeSchema,
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export const reportsContract = {
  reportsGenerate: oc
    .input(reportFilterInputSchema)
    .output(reportSchema),
} as const;
