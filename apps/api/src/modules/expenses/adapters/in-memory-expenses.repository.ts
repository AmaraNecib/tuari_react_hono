import type { ExpenseRepository } from "../expenses.repository";
import type {
  CreateExpenseRecord,
  CreateExpenseRevisionRecord,
  Expense,
  ExpenseAudit,
  ExpenseListFilters,
  ExpenseRevision,
  UpdateExpenseRecord,
  VoidExpenseRecord,
} from "../expenses.types";

function normalizeAudit(audit?: ExpenseAudit) {
  return {
    actorUserId: audit?.actorUserId ?? null,
    actorLabel: audit?.actorLabel ?? null,
    transactionId: audit?.transactionId ?? null,
  };
}

/**
 * In-memory expenses repository (test double).
 *
 * Mirrors the sqlite adapter's observable behavior: the same filter
 * semantics, the same ordering (`expense_date DESC, created_at DESC, id
 * DESC`), the same "void only a LIVE row" guard, and a transaction wrapper
 * that rolls back the in-memory maps when the callback throws.
 */
export function createInMemoryExpenseRepository(): ExpenseRepository {
  const expenses = new Map<string, Expense>();
  const revisions = new Map<string, ExpenseRevision>();

  return {
    async create(data: CreateExpenseRecord, audit?: ExpenseAudit): Promise<Expense> {
      const snapshot = normalizeAudit(audit);
      const expense: Expense = {
        id: data.id,
        amount: data.amount,
        expenseDate: data.expenseDate,
        whatFor: data.whatFor,
        responsibleWorkerId: data.responsibleWorkerId,
        sellerId: data.sellerId,
        projectId: data.projectId,
        stockItemId: data.stockItemId,
        note: data.note,
        status: "LIVE",
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
        actorUserId: snapshot.actorUserId,
        actorLabel: snapshot.actorLabel,
        transactionId: snapshot.transactionId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
      expenses.set(expense.id, expense);
      return expense;
    },

    async findById(id: string): Promise<Expense | null> {
      return expenses.get(id) ?? null;
    },

    async list(filters: ExpenseListFilters): Promise<Expense[]> {
      const items = [...expenses.values()].filter((expense) => {
        if (!filters.includeVoided && expense.status !== "LIVE") return false;
        if (filters.projectId !== undefined && expense.projectId !== filters.projectId) {
          return false;
        }
        if (
          filters.responsibleWorkerId !== undefined &&
          expense.responsibleWorkerId !== filters.responsibleWorkerId
        ) {
          return false;
        }
        if (filters.fromDate !== undefined && expense.expenseDate < filters.fromDate) {
          return false;
        }
        if (filters.toDate !== undefined && expense.expenseDate > filters.toDate) {
          return false;
        }
        return true;
      });

      return items.sort((a, b) => {
        if (a.expenseDate !== b.expenseDate) return a.expenseDate < b.expenseDate ? 1 : -1;
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
    },

    async update(data: UpdateExpenseRecord, audit?: ExpenseAudit): Promise<Expense | null> {
      const existing = expenses.get(data.id);
      if (!existing) return null;
      const snapshot = normalizeAudit(audit);
      const updated: Expense = {
        ...existing,
        amount: data.amount,
        expenseDate: data.expenseDate,
        whatFor: data.whatFor,
        responsibleWorkerId: data.responsibleWorkerId,
        sellerId: data.sellerId,
        projectId: data.projectId,
        stockItemId: data.stockItemId,
        note: data.note,
        actorUserId: snapshot.actorUserId,
        actorLabel: snapshot.actorLabel,
        transactionId: snapshot.transactionId,
        updatedAt: data.updatedAt,
      };
      expenses.set(data.id, updated);
      return updated;
    },

    async voidExpense(data: VoidExpenseRecord, audit?: ExpenseAudit): Promise<Expense | null> {
      const existing = expenses.get(data.id);
      if (!existing || existing.status !== "LIVE") return null;
      const snapshot = normalizeAudit(audit);
      const voided: Expense = {
        ...existing,
        status: "VOIDED",
        voidedAt: data.voidedAt,
        voidedBy: snapshot.actorLabel,
        voidReason: data.voidReason,
        actorUserId: snapshot.actorUserId,
        actorLabel: snapshot.actorLabel,
        transactionId: snapshot.transactionId,
        updatedAt: data.updatedAt,
      };
      expenses.set(data.id, voided);
      return voided;
    },

    async createRevision(
      data: CreateExpenseRevisionRecord,
      audit?: ExpenseAudit,
    ): Promise<ExpenseRevision> {
      const snapshot = normalizeAudit(audit);
      const revision: ExpenseRevision = {
        id: data.id,
        expenseId: data.expenseId,
        previousAmount: data.previousAmount,
        newAmount: data.newAmount,
        reason: data.reason,
        actorUserId: snapshot.actorUserId,
        actorLabel: snapshot.actorLabel,
        transactionId: snapshot.transactionId,
        createdAt: data.createdAt,
      };
      revisions.set(revision.id, revision);
      return revision;
    },

    async listRevisionsByExpenseId(expenseId: string): Promise<ExpenseRevision[]> {
      return [...revisions.values()]
        .filter((revision) => revision.expenseId === expenseId)
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
          return a.id < b.id ? -1 : 1;
        });
    },

    async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
      const expenseSnapshot = new Map(expenses);
      const revisionSnapshot = new Map(revisions);
      try {
        return await fn();
      } catch (err) {
        expenses.clear();
        for (const [key, value] of expenseSnapshot) expenses.set(key, value);
        revisions.clear();
        for (const [key, value] of revisionSnapshot) revisions.set(key, value);
        throw err;
      }
    },
  };
}
