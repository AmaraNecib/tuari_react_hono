import { oc } from "@orpc/contract";

import { createEntityResultSchema } from "./core";
import { projectCostInputSchema, projectCostSchema } from "./project-cost";

export const projectCostContract = {
  /** One project's total, its four cost parts and the rows behind each part. */
  projectCostGet: oc
    .input(projectCostInputSchema)
    .output(createEntityResultSchema(projectCostSchema)),
} as const;

export type ProjectCostContract = typeof projectCostContract;
