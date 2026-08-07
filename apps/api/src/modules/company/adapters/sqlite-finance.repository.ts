import type { FinanceRepository } from "../finance.repository";
import type { SqliteCompanyRepository } from "./sqlite-company.repository";
import type {
  DebtAccountCreateData, DebtAccountListFilters, DebtAccountRecord,
  DebtAccountUpdateData, DebtEntryCreateData, DebtEntryListFilters,
  DebtEntryRecord, DebtEntryVoidData,
  ExternalCounterpartyCreateData, ExternalCounterpartyListFilters,
  ExternalCounterpartyRecord, MutationAuditContext,
} from "../company.types";

export class SqliteFinanceRepository implements FinanceRepository {
  constructor(private readonly inner: SqliteCompanyRepository) {}
  listExternalCounterparties(filters?: ExternalCounterpartyListFilters): ExternalCounterpartyRecord[] { return this.inner.listExternalCounterparties(filters); }
  getExternalCounterpartyById(id: string): ExternalCounterpartyRecord | null { return this.inner.getExternalCounterpartyById(id); }
  createExternalCounterparty(data: ExternalCounterpartyCreateData): ExternalCounterpartyRecord { return this.inner.createExternalCounterparty(data); }
  listDebtAccounts(filters?: DebtAccountListFilters): DebtAccountRecord[] { return this.inner.listDebtAccounts(filters); }
  getDebtAccountById(id: string): DebtAccountRecord | null { return this.inner.getDebtAccountById(id); }
  getDebtAccountByWorkerId(workerId: string): DebtAccountRecord | null { return this.inner.getDebtAccountByWorkerId(workerId); }
  getDebtAccountByExternalCounterpartyId(ecId: string): DebtAccountRecord | null { return this.inner.getDebtAccountByExternalCounterpartyId(ecId); }
  getDebtAccountByExternalCounterpartyIdAndDirection(ecId: string, direction: DebtAccountRecord["direction"]): DebtAccountRecord | null { return this.inner.getDebtAccountByExternalCounterpartyIdAndDirection(ecId, direction); }
  createDebtAccount(data: DebtAccountCreateData, audit?: MutationAuditContext): DebtAccountRecord { return this.inner.createDebtAccount(data, audit); }
  updateDebtAccount(data: DebtAccountUpdateData, audit?: MutationAuditContext): DebtAccountRecord | null { return this.inner.updateDebtAccount(data, audit); }
  listDebtEntries(filters: DebtEntryListFilters): DebtEntryRecord[] { return this.inner.listDebtEntries(filters); }
  getDebtEntryById(id: string): DebtEntryRecord | null { return this.inner.getDebtEntryById(id); }
  getLatestDebtEntry(accountId: string): DebtEntryRecord | null { return this.inner.getLatestDebtEntry(accountId); }
  listAllDebtEntries(): DebtEntryRecord[] { return this.inner.listAllDebtEntries(); }
  createDebtEntry(data: DebtEntryCreateData, audit?: MutationAuditContext): DebtEntryRecord { return this.inner.createDebtEntry(data, audit); }
  voidDebtEntry(data: DebtEntryVoidData, audit?: MutationAuditContext): DebtEntryRecord | null { return this.inner.voidDebtEntry(data, audit); }
  updateDebtEntryBalanceAfter(id: string, balanceAfterDzd: number): void { return this.inner.updateDebtEntryBalanceAfter(id, balanceAfterDzd); }
}
