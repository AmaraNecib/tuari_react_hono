import { Money, sumMoney } from "@tuari/contracts";

import { createExpenseLifecycle } from "./expenses.module";
import type { ExpenseRepository } from "./expenses.repository";
import { ExpenseInvalidAmountError } from "./expenses.types";

/** Exact expense composition is not registered in production dependencies or RPC. */
export function createExactExpensesModule(repo: ExpenseRepository<string>) {
  return createExpenseLifecycle(repo, {
    currency: "DZD",
    untagged: (_total, _tagged, values) => sumMoney(values.map((value) => Money.parse(value))),
    normalize(value) {
      try {
        const amount = Money.parse(value);
        if (BigInt(amount.toMinorUnits()) <= 0n) throw new RangeError("Expected a positive expense");
        return amount.toWire();
      } catch {
        throw new ExpenseInvalidAmountError(value);
      }
    },
    sum: (values) => sumMoney(values.map((value) => Money.parse(value))),
    // Totals are canonical, positive decimal strings with exactly two places.
    compare: (left, right) => left.length - right.length || (left < right ? -1 : left > right ? 1 : 0),
  });
}
