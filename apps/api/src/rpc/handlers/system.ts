import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type { CompanyService } from "../../modules/company/company.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createSystemHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
): Record<string, any> {
  return {
    workspaceSnapshot: os.workspaceSnapshot.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getWorkspaceSnapshot()
    )),
    systemLogList: os.systemLogList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listSystemLog(input ?? undefined)
    )),
  };
}
