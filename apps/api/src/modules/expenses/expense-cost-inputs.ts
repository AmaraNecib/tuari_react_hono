import { Money } from "@tuari/contracts";

import type { ExpenseRepository } from "./expenses.repository";

/** Source records for the future exact project-cost calculation, never a combined numeric total. */
export type ExactExpenseCostInput = Readonly<{
  id: string;
  expenseDate: string;
  whatFor: string | null;
  amountDzd: string;
  currency: "DZD";
  projectId: string;
  responsibleWorkerId: string | null;
  sellerId: string | null;
}>;

export async function listExactExpenseCostInputs(
  repo: ExpenseRepository<string>,
  projectId: string,
): Promise<ExactExpenseCostInput[]> {
  const expenses = await repo.list({ projectId });
  return expenses.filter((expense) => expense.status === "LIVE").map((expense) => {
    if (expense.currency !== "DZD") throw new TypeError("Exact expense cost requires DZD");
    return {
      id: expense.id,
      expenseDate: expense.expenseDate,
      whatFor: expense.whatFor,
      amountDzd: Money.parse(expense.amount, expense.currency).toWire(),
      currency: expense.currency,
      projectId,
      responsibleWorkerId: expense.responsibleWorkerId,
      sellerId: expense.sellerId,
    };
  });
}
