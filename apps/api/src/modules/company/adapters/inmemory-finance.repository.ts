/**
 * In-memory FinanceRepository for tests and the InMemory adapter.
 */

import type { FinanceRepository } from "../finance.repository";
import type {
  DebtAccountCreateData, DebtAccountListFilters, DebtAccountRecord,
  DebtAccountUpdateData, DebtEntryCreateData, DebtEntryListFilters,
  DebtEntryRecord, DebtEntryVoidData,
  ExternalCounterpartyCreateData, ExternalCounterpartyListFilters,
  ExternalCounterpartyRecord, MutationAuditContext,
} from "../company.types";
import { InMemoryStore, normalizeAudit, now, newId } from "./inmemory-store";

const sortByUpdated = (a: { updatedAt: string; createdAt: string }, b: { updatedAt: string; createdAt: string }) =>
  a.updatedAt === b.updatedAt ? (a.createdAt < b.createdAt ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1;

export class InMemoryFinanceRepository implements FinanceRepository {
  constructor(private readonly store: InMemoryStore) {}

  listExternalCounterparties(filters?: ExternalCounterpartyListFilters): ExternalCounterpartyRecord[] {
    const all = Array.from(this.store.externalCounterparties.values());
    const filtered = filters ? all.filter((c) => !filters.fullName || c.fullName.includes(filters.fullName)) : all;
    return filtered.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
  getExternalCounterpartyById(id: string): ExternalCounterpartyRecord | null {
    return this.store.externalCounterparties.get(id) ?? null;
  }
  createExternalCounterparty(data: ExternalCounterpartyCreateData): ExternalCounterpartyRecord {
    const id = newId(); const ts = now();
    const record: ExternalCounterpartyRecord = { id, fullName: data.fullName, phoneNumber: data.phoneNumber, note: data.note ?? null, createdAt: ts, updatedAt: ts };
    this.store.externalCounterparties.set(id, record);
    return record;
  }

  listDebtAccounts(filters?: DebtAccountListFilters): DebtAccountRecord[] {
    const all = Array.from(this.store.debtAccounts.values());
    const filtered = filters ? all.filter((a) =>
      (!filters.partyType || a.partyType === filters.partyType) &&
      (!filters.workerId || a.workerId === filters.workerId) &&
      (!filters.externalCounterpartyId || a.externalCounterpartyId === filters.externalCounterpartyId) &&
      (!filters.direction || a.direction === filters.direction) &&
      (!filters.status || a.status === filters.status),
    ) : all;
    return filtered.sort(sortByUpdated);
  }
  getDebtAccountById(id: string): DebtAccountRecord | null {
    return this.store.debtAccounts.get(id) ?? null;
  }
  getDebtAccountByWorkerId(workerId: string): DebtAccountRecord | null {
    for (const a of this.store.debtAccounts.values()) if (a.workerId === workerId) return a;
    return null;
  }
  getDebtAccountByExternalCounterpartyId(ecId: string): DebtAccountRecord | null {
    for (const a of this.store.debtAccounts.values()) if (a.externalCounterpartyId === ecId) return a;
    return null;
  }
  getDebtAccountByExternalCounterpartyIdAndDirection(ecId: string, direction: DebtAccountRecord["direction"]): DebtAccountRecord | null {
    for (const a of this.store.debtAccounts.values()) if (a.externalCounterpartyId === ecId && a.direction === direction) return a;
    return null;
  }
  createDebtAccount(data: DebtAccountCreateData, audit?: MutationAuditContext): DebtAccountRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record: DebtAccountRecord = { id, partyType: data.partyType, workerId: data.workerId ?? null, externalCounterpartyId: data.externalCounterpartyId ?? null, status: data.status, direction: data.direction, currentBalance: data.currentBalance, note: data.note ?? null, settledAt: data.settledAt ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.debtAccounts.set(id, record);
    return record;
  }
  updateDebtAccount(data: DebtAccountUpdateData, audit?: MutationAuditContext): DebtAccountRecord | null {
    const cur = this.store.debtAccounts.get(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = now();
    const record = { ...cur, status: data.status, currentBalance: data.currentBalance, settledAt: data.settledAt ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: ts };
    this.store.debtAccounts.set(data.id, record);
    return record;
  }

  listDebtEntries(filters: DebtEntryListFilters): DebtEntryRecord[] {
    const all = Array.from(this.store.debtEntries.values()).filter((e) => e.debtAccountId === filters.debtAccountId);
    return all.sort(sortByUpdated);
  }
  getDebtEntryById(id: string): DebtEntryRecord | null {
    return this.store.debtEntries.get(id) ?? null;
  }
  getLatestDebtEntry(accountId: string): DebtEntryRecord | null {
    let latest: DebtEntryRecord | null = null;
    for (const e of this.store.debtEntries.values()) {
      if (e.debtAccountId !== accountId) continue;
      if (!latest || e.entryDate > latest.entryDate || (e.entryDate === latest.entryDate && e.createdAt > latest.createdAt)) latest = e;
    }
    return latest;
  }
  listAllDebtEntries(): DebtEntryRecord[] {
    return Array.from(this.store.debtEntries.values()).sort(sortByUpdated);
  }
  createDebtEntry(data: DebtEntryCreateData, audit?: MutationAuditContext): DebtEntryRecord {
    const id = newId(); const ts = now(); const a = normalizeAudit(audit);
    const record: DebtEntryRecord = { id, debtAccountId: data.debtAccountId, entryType: data.entryType, signedAmountDzd: data.signedAmountDzd, entryDate: data.entryDate, note: data.note ?? null, balanceAfterDzd: data.balanceAfterDzd, reasonCategory: data.reasonCategory ?? "INVOICE_DRIVEN", reasonDetail: data.reasonDetail ?? null, paymentMethod: data.paymentMethod ?? null, status: data.status ?? "LIVE", voidedAt: data.voidedAt ?? null, voidedBy: data.voidedBy ?? null, voidReason: data.voidReason ?? null, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, createdAt: ts, updatedAt: ts };
    this.store.debtEntries.set(id, record);
    return record;
  }
  voidDebtEntry(data: DebtEntryVoidData, audit?: MutationAuditContext): DebtEntryRecord | null {
    const cur = this.store.debtEntries.get(data.id);
    if (!cur) return null;
    const a = normalizeAudit(audit); const ts = now();
    const record = { ...cur, status: "VOIDED", voidedAt: data.voidedAt, voidedBy: data.voidedBy ?? a.actorLabel ?? a.actorUserId, voidReason: data.voidReason, actorUserId: a.actorUserId, actorLabel: a.actorLabel, transactionId: a.transactionId, updatedAt: ts };
    this.store.debtEntries.set(data.id, record);
    return record;
  }
  updateDebtEntryBalanceAfter(id: string, balanceAfterDzd: number): void {
    const cur = this.store.debtEntries.get(id);
    if (cur) this.store.debtEntries.set(id, { ...cur, balanceAfterDzd, updatedAt: now() });
  }
}
