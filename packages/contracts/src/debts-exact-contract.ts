import { oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";
import { entityIdSchema } from "./core";
import {
  createExactDebtAccountSchema, postExactDebtEntrySchema, payExactDebtEntrySchema,
  correctExactDebtEntrySchema, voidExactDebtEntrySchema, settleExactDebtAccountSchema,
  exactDebtAccountSchema, exactDebtEntrySchema, exactDebtDetailSchema, exactDebtSummarySchema,
} from "./debts-exact";

/** Isolated exact composition only. Never registered in the numeric appContract. */
export const exactDebtsContract = {
  summary: oc.output(exactDebtSummarySchema),
  detail: oc.input(z.object({ id: entityIdSchema })).output(exactDebtDetailSchema),
  create: oc.input(createExactDebtAccountSchema).output(exactDebtAccountSchema),
  post: oc.input(postExactDebtEntrySchema).output(exactDebtEntrySchema),
  pay: oc.input(payExactDebtEntrySchema).output(exactDebtEntrySchema),
  correct: oc.input(correctExactDebtEntrySchema).output(exactDebtEntrySchema),
  void: oc.input(voidExactDebtEntrySchema).output(exactDebtEntrySchema),
  settle: oc.input(settleExactDebtAccountSchema).output(z.array(exactDebtEntrySchema)),
} as const;
export type ExactDebtsClient = ContractRouterClient<typeof exactDebtsContract>;
