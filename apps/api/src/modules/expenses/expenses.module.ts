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
export interface ExpenseAmountPolicy<Amount> {
  currency?: "DZD";
  untagged(total: Amount, tagged: Amount, values: Amount[]): Amount;
  normalize(value: Amount): Amount;
  sum(values: Amount[]): Amount;
  compare(left: Amount, right: Amount): number;
}

const numericAmounts: ExpenseAmountPolicy<number> = {
  untagged: (total, tagged) => total - tagged,
  normalize(amount) {
    if (!paymentAmountSchema.safeParse(amount).success) {
      throw new ExpenseInvalidAmountError(amount);
    }
    return amount;
  },
  sum: (values) => values.reduce((total, value) => total + value, 0),
  compare: (left, right) => left - right,
};

export function createExpensesModule(repo: ExpenseRepository): ExpensesModule {
  return createExpenseLifecycle(repo, numericAmounts);
}

/** Shared lifecycle. Exact composition never selects the numeric policy. */
export function createExpenseLifecycle<Amount>(
  repo: ExpenseRepository<Amount>,
  amounts: ExpenseAmountPolicy<Amount>,
): ExpensesModule<Amount> {
  function computeTotals(items: Expense<Amount>[]): ExpenseTotals<Amount> {
    const live = items.filter((item) => item.status === "LIVE");
    const tagged = live.filter((item) => item.projectId !== null);
    const held = live.filter((item) => item.responsibleWorkerId !== null);
    const total = amounts.sum(live.map((item) => item.amount));
    const taggedToProject = amounts.sum(tagged.map((item) => item.amount));
    return {
      total,
      count: live.length,
      taggedToProject,
      notTaggedToProject: amounts.untagged(total, taggedToProject, live.filter((item) => item.projectId === null).map((item) => item.amount)),
      heldByWorkers: amounts.sum(held.map((item) => item.amount)),
      workerCount: new Set(held.map((item) => item.responsibleWorkerId)).size,
    };
  }

  function computeGroups(items: Expense<Amount>[]): ExpenseProjectGroup<Amount>[] {
    const byProject = new Map<string | null, Amount[]>();
    for (const item of items) {
      if (item.status !== "LIVE") continue;
      const values = byProject.get(item.projectId) ?? [];
      values.push(item.amount);
      byProject.set(item.projectId, values);
    }
    return [...byProject].map(([projectId, values]) => ({
      projectId, total: amounts.sum(values), count: values.length,
    })).sort((a, b) => {
      if (a.projectId === null) return 1;
      if (b.projectId === null) return -1;
      const difference = amounts.compare(b.total, a.total);
      return difference || a.projectId.localeCompare(b.projectId);
    });
  }

  /**
   * The editable fields whose value differs between the locked row and the
   * requested edit. Computing this from the LOCKED state is what lets a
   * revision say "the project changed" and not merely "the amount changed".
   */
  function collectChangedFields(
    existing: Expense<Amount>,
    next: {
      amount: Amount;
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
    input: CreateExpenseInput<Amount>,
    audit?: ExpenseAudit,
  ): Promise<Expense<Amount>> {
    const amount = amounts.normalize(input.amount);
    if (amounts.currency && input.currency !== undefined && input.currency !== amounts.currency) {
      throw new ExpenseInvalidAmountError(input.currency);
    }
    const now = new Date().toISOString();

    return repo.create(
      {
        id: input.id,
        ...(amounts.currency ? { currency: amounts.currency } : {}),
        amount,
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

  async function get(id: string): Promise<ExpenseWithRevisions<Amount> | null> {
    const expense = await repo.findById(id);
    if (!expense) return null;
    const revisions = await repo.listRevisionsByExpenseId(id);
    return { ...expense, revisions };
  }

  async function list(filters?: ExpenseListFilters): Promise<ExpenseListResult<Amount>> {
    const items = await repo.list(filters ?? {});
    return {
      items,
      totals: computeTotals(items),
      groupsByProject: computeGroups(items),
    };
  }

  async function update(
    input: UpdateExpenseInput<Amount>,
    audit?: ExpenseAudit,
  ): Promise<Expense<Amount>> {
    const amount = input.amount === undefined ? undefined : amounts.normalize(input.amount);

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
        amount: amount ?? existing.amount,
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
      const revisions = await repo.listRevisionsByExpenseId(input.id);
      const latestRevisionAt = revisions.at(-1)?.createdAt;
      const revisionCreatedAt = latestRevisionAt
        ? new Date(
            Math.max(Date.now(), Date.parse(latestRevisionAt) + 1),
          ).toISOString()
        : now;

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
          createdAt: revisionCreatedAt,
        },
        audit,
      );

      return updated;
    });
  }

  async function voidExpense(
    input: VoidExpenseInput,
    audit?: ExpenseAudit,
  ): Promise<Expense<Amount>> {
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
