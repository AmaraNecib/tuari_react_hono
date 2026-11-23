/**
 * Finance repository interface.
 *
 * Owns the data-access seam for the finance domain: debt accounts,
 * debt entries, and external counterparties.
 */

import type {
  DebtAccountCreateData,
  DebtAccountListFilters,
  DebtAccountRecord,
  DebtAccountUpdateData,
  DebtEntryCreateData,
  DebtEntryListFilters,
  DebtEntryRecord,
  DebtEntryVoidData,
  ExternalCounterpartyCreateData,
  ExternalCounterpartyListFilters,
  ExternalCounterpartyRecord,
  MutationAuditContext,
} from "./company.types";

export interface FinanceRepository {
  // External counterparties
  listExternalCounterparties(
    filters?: ExternalCounterpartyListFilters,
  ): ExternalCounterpartyRecord[];
  getExternalCounterpartyById(id: string): ExternalCounterpartyRecord | null;
  createExternalCounterparty(
    data: ExternalCounterpartyCreateData,
  ): ExternalCounterpartyRecord;

  // Debt accounts
  listDebtAccounts(filters?: DebtAccountListFilters): DebtAccountRecord[];
  getDebtAccountById(id: string): DebtAccountRecord | null;
  getDebtAccountByWorkerIdAndDirection(
    workerId: string,
    direction: DebtAccountRecord["direction"],
  ): DebtAccountRecord | null;
  getDebtAccountByExternalCounterpartyId(
    externalCounterpartyId: string,
  ): DebtAccountRecord | null;
  getDebtAccountByExternalCounterpartyIdAndDirection(
    externalCounterpartyId: string,
    direction: DebtAccountRecord["direction"],
  ): DebtAccountRecord | null;
  createDebtAccount(
    data: DebtAccountCreateData,
    auditContext?: MutationAuditContext,
  ): DebtAccountRecord;
  updateDebtAccount(
    data: DebtAccountUpdateData,
    auditContext?: MutationAuditContext,
  ): DebtAccountRecord | null;

  // Debt entries
  listDebtEntries(filters: DebtEntryListFilters): DebtEntryRecord[];
  getDebtEntryById(id: string): DebtEntryRecord | null;
  getLatestDebtEntry(accountId: string): DebtEntryRecord | null;
  listAllDebtEntries(): DebtEntryRecord[];
  createDebtEntry(
    data: DebtEntryCreateData,
    auditContext?: MutationAuditContext,
  ): DebtEntryRecord;
  voidDebtEntry(
    data: DebtEntryVoidData,
    auditContext?: MutationAuditContext,
  ): DebtEntryRecord | null;
  updateDebtEntryBalanceAfter(id: string, balanceAfterDzd: number): void;
}
