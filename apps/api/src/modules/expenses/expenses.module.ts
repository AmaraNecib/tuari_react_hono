import { randomUUID } from "node:crypto";
import { paymentAmountSchema } from "@tuari/contracts";

import type { ExpenseRepository } from "./expenses.repository";
import type { ExpensesModule } from "./expenses-module.interface";
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
        expenseDate: input.expenseDate,
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

    const existing = await repo.findById(input.id);
    if (!existing) throw new ExpenseNotFoundError(input.id);
    if (existing.status === "VOIDED") throw new ExpenseAlreadyVoidedError(input.id);

    const next = {
      amount: input.amount ?? existing.amount,
      expenseDate: input.expenseDate ?? existing.expenseDate,
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

    const changed =
      next.amount !== existing.amount ||
      next.expenseDate !== existing.expenseDate ||
      next.whatFor !== existing.whatFor ||
      next.responsibleWorkerId !== existing.responsibleWorkerId ||
      next.sellerId !== existing.sellerId ||
      next.projectId !== existing.projectId ||
      next.stockItemId !== existing.stockItemId ||
      next.note !== existing.note;

    if (!changed) return existing;

    const now = new Date().toISOString();

    return repo.runInTransaction(async () => {
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
  }

  return {
    create,
    get,
    list,
    update,
    void: voidExpense,
  };
}
