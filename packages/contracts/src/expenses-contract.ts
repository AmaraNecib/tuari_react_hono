import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  createExpenseInputSchema,
  expenseListInputSchema,
  expenseListOutputSchema,
  expenseSchema,
  expenseWithRevisionsSchema,
  updateExpenseInputSchema,
  voidExpenseInputSchema,
} from "./expenses";

export const expensesContract = {
  expensesList: oc
    .input(expenseListInputSchema)
    .output(expenseListOutputSchema),

  expensesGet: oc
    .input(z.object({ id: z.string().uuid() }))
    .output(expenseWithRevisionsSchema),

  expensesCreate: oc
    .input(createExpenseInputSchema)
    .output(expenseSchema),

  expensesUpdate: oc
    .input(updateExpenseInputSchema)
    .output(expenseSchema),

  expensesVoid: oc
    .input(voidExpenseInputSchema)
    .output(expenseSchema),
} as const;

export type ExpensesContract = typeof expensesContract;
