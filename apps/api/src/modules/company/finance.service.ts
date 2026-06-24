import type {
  DebtAccountCreateInput,
  DebtConsolidationInput,
  DebtEntryCreateInput,
  DebtEntryRecordPaymentInput,
  DebtEntryVoidInput,
  DebtPartyDetailInput,
  DebtSettlementInput,
  ExternalCounterpartyCreateInput,
} from "@tuari/contracts";

import type {
  ExternalCounterpartyListFilters,
  DebtAccountListFilters,
  DebtEntryListFilters,
  MutationAuditContext,
} from "./company.types";
import type { CompanyService } from "./company.service";

export class FinanceService {
  constructor(private readonly companyService: CompanyService) {}

  listExternalCounterparties(filters?: ExternalCounterpartyListFilters) {
    return this.companyService.listExternalCounterparties(filters);
  }

  getExternalCounterparty(id: string) {
    return this.companyService.getExternalCounterparty(id);
  }

  createExternalCounterparty(input: ExternalCounterpartyCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createExternalCounterparty(input, auditContext);
  }

  listDebtAccounts(filters?: DebtAccountListFilters) {
    return this.companyService.listDebtAccounts(filters);
  }

  getDebtAccount(id: string) {
    return this.companyService.getDebtAccount(id);
  }

  createDebtAccount(input: DebtAccountCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createDebtAccount(input, auditContext);
  }

  listDebtEntries(filters: DebtEntryListFilters) {
    return this.companyService.listDebtEntries(filters);
  }

  createDebtEntry(input: DebtEntryCreateInput, auditContext?: MutationAuditContext) {
    return this.companyService.createDebtEntry(input, auditContext);
  }

  recordDebtPayment(input: DebtEntryRecordPaymentInput, auditContext?: MutationAuditContext) {
    return this.companyService.recordDebtPayment(input, auditContext);
  }

  voidDebtEntry(input: DebtEntryVoidInput, auditContext?: MutationAuditContext) {
    return this.companyService.voidDebtEntry(input, auditContext);
  }

  consolidateDebtEntries(input: DebtConsolidationInput, auditContext?: MutationAuditContext) {
    return this.companyService.consolidateDebtEntries(input, auditContext);
  }

  settleDebtAccount(input: DebtSettlementInput, auditContext?: MutationAuditContext) {
    return this.companyService.settleDebtAccount(input, auditContext);
  }

  getDebtPartyDetail(input: DebtPartyDetailInput) {
    return this.companyService.getDebtPartyDetail(input);
  }

  listDebtsSummary() {
    return this.companyService.listDebtsSummary();
  }

  getEmployeeDebtAccount(employeeId: string) {
    return this.companyService.getEmployeeDebtAccount(employeeId);
  }

  createEmployeeDebtEntry(input: { employeeId: string; entryType: "OPENING" | "PAYMENT" | "ADJUSTMENT" | "ADVANCE"; amountDzd: number; entryDate?: string; note?: string }, auditContext?: MutationAuditContext) {
    return this.companyService.createEmployeeDebtEntry(input, auditContext);
  }
}
