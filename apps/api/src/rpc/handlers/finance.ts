import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type { CompanyService } from "../../modules/company/company.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createFinanceHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  companyService: CompanyService,
): Record<string, any> {
  return {
    externalCounterpartiesList: os.externalCounterpartiesList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listExternalCounterparties(input ?? undefined)
    )),
    externalCounterpartiesGet: os.externalCounterpartiesGet.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getExternalCounterparty((input as any).id)
    )),
    externalCounterpartiesCreate: os.externalCounterpartiesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createExternalCounterparty(input as any, auditContext),
      toFailureResult,
    )),
    debtAccountsList: os.debtAccountsList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listDebtAccounts(input ?? undefined)
    )),
    debtAccountsGet: os.debtAccountsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getDebtAccount((input as any).id)
    )),
    debtAccountsCreate: os.debtAccountsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createDebtAccount(input as any, auditContext),
      toFailureResult,
    )),
    debtEntriesList: os.debtEntriesList.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listDebtEntries(input as any)
    )),
    debtEntriesCreate: os.debtEntriesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.createDebtEntry(input as any, auditContext),
      toFailureResult,
    )),
    debtAccountsSettle: os.debtAccountsSettle.handler(m.mutationAudit(
      ({ input, auditContext }: any) => companyService.settleDebtAccount(input as any, auditContext),
      toFailureResult,
    )),
    debtPartyDetail: os.debtPartyDetail.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.getDebtPartyDetail(input as any)
    )),
    debtsSummary: os.debtsSummary.handler(m.queryAuth(async ({ context, input }: any) =>
      companyService.listDebtsSummary()
    )),
  };
}
