import { implement } from "@orpc/server";

import type { ProjectCostInput } from "@tuari/contracts";

import { toFailureResult } from "../../modules/project-cost/project-cost.errors";
import type { ProjectCostService } from "../../modules/project-cost/project-cost.service";
import type { RpcMiddleware } from "../rpc-middleware";

export function createProjectCostHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  projectCostService: ProjectCostService,
) {
  return {
    // `queryAuth`'s handler input is loose; the wire contract already narrowed
    // it before the handler runs, so the cast names the shape it arrives as.
    projectCostGet: os.projectCostGet.handler(m.queryAuth(
      async ({ input }) => projectCostService.getProjectCost(input as ProjectCostInput),
      toFailureResult,
    )),
  };
}
