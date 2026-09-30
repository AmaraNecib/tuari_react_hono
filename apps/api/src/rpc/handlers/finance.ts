import { implement } from "@orpc/server";

import type {
  DebtAccountCreateInput,
  DebtConsolidationInput,
  DebtEntryCreateInput,
  DebtEntryRecordPaymentInput,
  DebtEntryVoidInput,
  DebtPartyDetailInput,
  DebtSettlementInput,
  EmployeeDebtEntryCreateInput,
  ExternalCounterpartyCreateInput,
} from "@tuari/contracts";

import { toFailureResult } from "../../modules/company/company.errors";
import type {
  DebtAccountListFilters,
  DebtEntryListFilters,
  ExternalCounterpartyListFilters,
} from "../../modules/company/company.types";
import type { FinanceService } from "../../modules/company/finance.service";
import type { RpcMiddleware } from "../rpc-middleware";
import type { IdInput } from "./handler-inputs";

export function createFinanceHandlers(
  os: ReturnType<typeof implement>,
  m: RpcMiddleware,
  financeService: FinanceService,
) {
  return {
    externalCounterpartiesList: os.externalCounterpartiesList.handler(m.queryAuth(async ({ input }) =>
      financeService.listExternalCounterparties(input as ExternalCounterpartyListFilters | undefined)
    )),
    externalCounterpartiesGet: os.externalCounterpartiesGet.handler(m.queryAuth(async ({ input }) =>
      financeService.getExternalCounterparty((input as IdInput).id)
    )),
    externalCounterpartiesCreate: os.externalCounterpartiesCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.createExternalCounterparty(input as ExternalCounterpartyCreateInput, auditContext),
      toFailureResult,
    )),
    debtAccountsList: os.debtAccountsList.handler(m.queryAuth(async ({ input }) =>
      financeService.listDebtAccounts(input as DebtAccountListFilters | undefined)
    )),
    debtAccountsGet: os.debtAccountsGet.handler(m.queryAuth(async ({ input }) =>
      financeService.getDebtAccount((input as IdInput).id)
    )),
    debtAccountsCreate: os.debtAccountsCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.createDebtAccount(input as DebtAccountCreateInput, auditContext),
      toFailureResult,
    )),
    debtEntriesList: os.debtEntriesList.handler(m.queryAuth(async ({ input }) =>
      financeService.listDebtEntries(input as DebtEntryListFilters)
    )),
    debtEntriesCreate: os.debtEntriesCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.createDebtEntry(input as DebtEntryCreateInput, auditContext),
      toFailureResult,
    )),
    debtEntriesRecordPayment: os.debtEntriesRecordPayment.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.recordDebtPayment(input as DebtEntryRecordPaymentInput, auditContext),
      toFailureResult,
    )),
    debtEntriesVoid: os.debtEntriesVoid.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.voidDebtEntry(input as DebtEntryVoidInput, auditContext),
      toFailureResult,
    )),
    debtEntriesConsolidate: os.debtEntriesConsolidate.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.consolidateDebtEntries(input as DebtConsolidationInput, auditContext),
      toFailureResult,
    )),
    debtAccountsSettle: os.debtAccountsSettle.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.settleDebtAccount(input as DebtSettlementInput, auditContext),
      toFailureResult,
    )),
    debtPartyDetail: os.debtPartyDetail.handler(m.queryAuth(async ({ input }) =>
      financeService.getDebtPartyDetail(input as DebtPartyDetailInput)
    )),
    debtsSummary: os.debtsSummary.handler(m.queryAuth(async () =>
      financeService.listDebtsSummary()
    )),
    employeeDebtEntryCreate: os.employeeDebtEntryCreate.handler(m.mutationAudit(
      ({ input, auditContext }) => financeService.createEmployeeDebtEntry(input as EmployeeDebtEntryCreateInput, auditContext),
      toFailureResult,
    )),
  };
}
