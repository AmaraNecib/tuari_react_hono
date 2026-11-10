import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";

import { expenseListInputSchema, voidExpenseInputSchema } from "./expenses";
import {
  createExactExpenseInputSchema, exactExpenseListOutputSchema, exactExpenseSchema,
  exactExpenseWithRevisionsSchema, updateExactExpenseInputSchema,
} from "./expenses-exact";

/** Proof/integration contract only. Not registered in appContract before coordinated activation. */
export const exactExpensesContract = {
  expensesList: oc.input(expenseListInputSchema).output(exactExpenseListOutputSchema),
  expensesGet: oc.input(z.object({ id: z.string().uuid() })).output(exactExpenseWithRevisionsSchema),
  expensesCreate: oc.input(createExactExpenseInputSchema).output(exactExpenseSchema),
  expensesUpdate: oc.input(updateExactExpenseInputSchema).output(exactExpenseSchema),
  expensesVoid: oc.input(voidExpenseInputSchema).output(exactExpenseSchema),
} as const;

export type ExactExpensesClient = ContractRouterClient<typeof exactExpensesContract>;
