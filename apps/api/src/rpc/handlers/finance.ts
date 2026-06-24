import { implement } from "@orpc/server";

import { appContract } from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type { FinanceService } from "../../modules/company/finance.service";
import type { RpcContext } from "../context";
import type { RpcMiddleware } from "../rpc-middleware";

export function createFinanceHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  financeService: FinanceService,
): Record<string, any> {
  return {
    externalCounterpartiesList: os.externalCounterpartiesList.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.listExternalCounterparties(input ?? undefined)
    )),
    externalCounterpartiesGet: os.externalCounterpartiesGet.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.getExternalCounterparty((input as any).id)
    )),
    externalCounterpartiesCreate: os.externalCounterpartiesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => financeService.createExternalCounterparty(input as any, auditContext),
      toFailureResult,
    )),
    debtAccountsList: os.debtAccountsList.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.listDebtAccounts(input ?? undefined)
    )),
    debtAccountsGet: os.debtAccountsGet.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.getDebtAccount((input as any).id)
    )),
    debtAccountsCreate: os.debtAccountsCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => financeService.createDebtAccount(input as any, auditContext),
      toFailureResult,
    )),
    debtEntriesList: os.debtEntriesList.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.listDebtEntries(input as any)
    )),
    debtEntriesCreate: os.debtEntriesCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => financeService.createDebtEntry(input as any, auditContext),
      toFailureResult,
    )),
    debtEntriesRecordPayment: os.debtEntriesRecordPayment.handler(m.mutationAudit(
      ({ input, auditContext }: any) => financeService.recordDebtPayment(input as any, auditContext),
      toFailureResult,
    )),
    debtEntriesVoid: os.debtEntriesVoid.handler(m.mutationAudit(
      ({ input, auditContext }: any) => financeService.voidDebtEntry(input as any, auditContext),
      toFailureResult,
    )),
    debtAccountsSettle: os.debtAccountsSettle.handler(m.mutationAudit(
      ({ input, auditContext }: any) => financeService.settleDebtAccount(input as any, auditContext),
      toFailureResult,
    )),
    debtPartyDetail: os.debtPartyDetail.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.getDebtPartyDetail(input as any)
    )),
    debtsSummary: os.debtsSummary.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.listDebtsSummary()
    )),
    employeeDebtAccountGet: os.employeeDebtAccountGet.handler(m.queryAuth(async ({ context, input }: any) =>
      financeService.getEmployeeDebtAccount((input as any).employeeId)
    )),
    employeeDebtEntryCreate: os.employeeDebtEntryCreate.handler(m.mutationAudit(
      ({ input, auditContext }: any) => financeService.createEmployeeDebtEntry(input as any, auditContext),
      toFailureResult,
    )),
  };
}
