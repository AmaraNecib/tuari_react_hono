import { randomUUID } from "node:crypto";
import { paymentAmountSchema } from "@tuari/contracts";

import type { ExpenseRepository } from "./expenses.repository";
import type { ExpensesModule } from "./expenses-module.interface";
import { toUtcInstant } from "./expenses.time";
import {
  ExpenseAlreadyVoidedError,
  ExpenseInvalidAmountError,
  ExpenseNotFoundError,
} from "./expenses.types";
import type {
  CreateExpenseInput,
  Expense,
  ExpenseAudit,
  ExpenseListFilters,
  ExpenseListResult,
  ExpenseProjectGroup,
  ExpenseRevisionField,
  ExpenseTotals,
  ExpenseWithRevisions,
  UpdateExpenseInput,
  VoidExpenseInput,
} from "./expenses.types";

/**
 * ExpensesModule — records and manages money that leaves the business for
 * something that is not stock (issue #411).
 *
 * Rules enforced here:
 *  - `amount` reuses `paymentAmountSchema` (service-boundary defense-in-depth:
 *    a direct caller cannot record a zero/negative amount the wire gate would
 *    have rejected).
 *  - Void, never delete: the row stays and is excluded from totals.
 *  - Tagging a project charges the WHOLE amount to that project — there is no
 *    partial allocation on an expense.
 *  - An expense never writes stock; `stockItemId` is a reference only.
 *  - Every edit records a revision with actor, timestamp and an optional
 *    reason.
 */
export function createExpensesModule(repo: ExpenseRepository): ExpensesModule {
  function assertValidAmount(amount: number): void {
    if (!paymentAmountSchema.safeParse(amount).success) {
      throw new ExpenseInvalidAmountError(amount);
    }
  }

  function computeTotals(items: Expense[]): ExpenseTotals {
    const live = items.filter((item) => item.status === "LIVE");
    let total = 0;
    let taggedToProject = 0;
    let heldByWorkers = 0;
    const workers = new Set<string>();

    for (const item of live) {
      total += item.amount;
      if (item.projectId !== null) {
        taggedToProject += item.amount;
      }
      if (item.responsibleWorkerId !== null) {
        heldByWorkers += item.amount;
        workers.add(item.responsibleWorkerId);
      }
    }

    return {
      total,
      count: live.length,
      taggedToProject,
      notTaggedToProject: total - taggedToProject,
      heldByWorkers,
      workerCount: workers.size,
    };
  }

  /**
   * Group live expenses by project. Deterministic order: projects by total
   * descending then id, with the untagged group (`projectId: null`) last —
   * matching the prototype's "بدون مشروع" card.
   */
  function computeGroups(items: Expense[]): ExpenseProjectGroup[] {
    const byProject = new Map<string | null, ExpenseProjectGroup>();

    for (const item of items) {
      if (item.status !== "LIVE") continue;
      const key = item.projectId;
      const group = byProject.get(key);
      if (group) {
        group.total += item.amount;
        group.count += 1;
      } else {
        byProject.set(key, { projectId: key, total: item.amount, count: 1 });
      }
    }

    return [...byProject.values()].sort((a, b) => {
      if (a.projectId === null) return 1;
      if (b.projectId === null) return -1;
      if (a.total !== b.total) return b.total - a.total;
      return a.projectId.localeCompare(b.projectId);
    });
  }

  /**
   * The editable fields whose value differs between the locked row and the
   * requested edit. Computing this from the LOCKED state is what lets a
   * revision say "the project changed" and not merely "the amount changed".
   */
  function collectChangedFields(
    existing: Expense,
    next: {
      amount: number;
      expenseDate: string;
      whatFor: string | null;
      responsibleWorkerId: string | null;
      sellerId: string | null;
      projectId: string | null;
      stockItemId: string | null;
      note: string | null;
    },
  ): ExpenseRevisionField[] {
    const changed: ExpenseRevisionField[] = [];
    if (next.amount !== existing.amount) changed.push("amount");
    if (next.expenseDate !== existing.expenseDate) changed.push("expenseDate");
    if (next.whatFor !== existing.whatFor) changed.push("whatFor");
    if (next.responsibleWorkerId !== existing.responsibleWorkerId) {
      changed.push("responsibleWorkerId");
    }
    if (next.sellerId !== existing.sellerId) changed.push("sellerId");
    if (next.projectId !== existing.projectId) changed.push("projectId");
    if (next.stockItemId !== existing.stockItemId) changed.push("stockItemId");
    if (next.note !== existing.note) changed.push("note");
    return changed;
  }

  async function create(
    input: CreateExpenseInput,
    audit?: ExpenseAudit,
  ): Promise<Expense> {
    assertValidAmount(input.amount);
    const now = new Date().toISOString();

    return repo.create(
      {
        id: input.id,
        amount: input.amount,
        expenseDate: toUtcInstant(input.expenseDate),
        whatFor: input.whatFor ?? null,
        responsibleWorkerId: input.responsibleWorkerId ?? null,
        sellerId: input.sellerId ?? null,
        projectId: input.projectId ?? null,
        stockItemId: input.stockItemId ?? null,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      },
      audit,
    );
  }

  async function get(id: string): Promise<ExpenseWithRevisions | null> {
    const expense = await repo.findById(id);
    if (!expense) return null;
    const revisions = await repo.listRevisionsByExpenseId(id);
    return { ...expense, revisions };
  }

  async function list(filters?: ExpenseListFilters): Promise<ExpenseListResult> {
    const items = await repo.list(filters ?? {});
    return {
      items,
      totals: computeTotals(items),
      groupsByProject: computeGroups(items),
    };
  }

  async function update(
    input: UpdateExpenseInput,
    audit?: ExpenseAudit,
  ): Promise<Expense> {
    if (input.amount !== undefined) {
      assertValidAmount(input.amount);
    }

    // The read-modify-write runs ENTIRELY inside the locked transaction: a
    // concurrent edit or void can no longer slip between the read and the
    // write, so the revision is computed from the state the write will apply
    // to, and an edit to a row voided in the meantime is rejected instead of
    // resurrecting it.
    return repo.runInTransaction(async () => {
      const existing = await repo.findById(input.id);
      if (!existing) throw new ExpenseNotFoundError(input.id);
      if (existing.status === "VOIDED") throw new ExpenseAlreadyVoidedError(input.id);

      const next = {
        amount: input.amount ?? existing.amount,
        expenseDate:
          input.expenseDate === undefined
            ? existing.expenseDate
            : toUtcInstant(input.expenseDate),
        whatFor: input.whatFor === undefined ? existing.whatFor : input.whatFor,
        responsibleWorkerId:
          input.responsibleWorkerId === undefined
            ? existing.responsibleWorkerId
            : input.responsibleWorkerId,
        sellerId: input.sellerId === undefined ? existing.sellerId : input.sellerId,
        projectId: input.projectId === undefined ? existing.projectId : input.projectId,
        stockItemId:
          input.stockItemId === undefined ? existing.stockItemId : input.stockItemId,
        note: input.note === undefined ? existing.note : input.note,
      };

      const changedFields = collectChangedFields(existing, next);
      if (changedFields.length === 0) return existing;

      const now = new Date().toISOString();

      const updated = await repo.update(
        {
          id: input.id,
          ...next,
          updatedAt: now,
        },
        audit,
      );
      if (!updated) throw new ExpenseNotFoundError(input.id);

      await repo.createRevision(
        {
          id: randomUUID(),
          expenseId: input.id,
          previousAmount: existing.amount,
          newAmount: next.amount,
          changedFields,
          reason: input.reason ?? null,
          createdAt: now,
        },
        audit,
      );

      return updated;
    });
  }

  async function voidExpense(
    input: VoidExpenseInput,
    audit?: ExpenseAudit,
  ): Promise<Expense> {
    // Re-read and re-validate under the lock so the void decision is made
    // against the state the write will see (no TOCTOU with a concurrent edit
    // or a second void).
    return repo.runInTransaction(async () => {
      const existing = await repo.findById(input.id);
      if (!existing) throw new ExpenseNotFoundError(input.id);
      if (existing.status === "VOIDED") throw new ExpenseAlreadyVoidedError(input.id);

      const now = new Date().toISOString();
      const voided = await repo.voidExpense(
        {
          id: input.id,
          voidedAt: now,
          voidReason: input.reason ?? null,
          updatedAt: now,
        },
        audit,
      );
      if (!voided) throw new ExpenseNotFoundError(input.id);

      return voided;
    });
  }

  return {
    create,
    get,
    list,
    update,
    void: voidExpense,
  };
}
