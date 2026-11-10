import { Money } from "@tuari/contracts";

import { bindMoney } from "../../../infrastructure/database/exact-money-storage";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import { SqliteExpenseStorage, type ExpenseStorageCodec } from "./sqlite-expenses.repository";

function positiveMoney(value: unknown): Money {
  const money = Money.fromMinorUnits(value);
  if (BigInt(money.toMinorUnits()) <= 0n) throw new RangeError("Expense amount must be positive");
  return money;
}

const exactStorage: ExpenseStorageCodec<string> = {
  amountColumn: "amount_minor",
  previousColumn: "previous_amount_minor",
  newColumn: "new_amount_minor",
  currency: "DZD",
  // CAST from validated native INTEGER to TEXT is exact; unrelated integers keep normal reads.
  expenseProjection: `id, CAST(amount_minor AS TEXT) AS amount_dzd, typeof(amount_minor) AS amount_type,
    currency, expense_date, what_for, responsible_worker_id, seller_id, project_id,
    stock_item_id, note, status, voided_at, voided_by, void_reason,
    actor_user_id, actor_label, transaction_id, created_at, updated_at`,
  revisionProjection: `id, expense_id, CAST(previous_amount_minor AS TEXT) AS previous_amount_dzd,
    typeof(previous_amount_minor) AS previous_type, CAST(new_amount_minor AS TEXT) AS new_amount_dzd,
    typeof(new_amount_minor) AS new_type, changed_fields, reason, actor_user_id, actor_label,
    transaction_id, created_at`,
  encode: (value) => {
    const money = Money.parse(value);
    positiveMoney(money.toMinorUnits());
    return bindMoney(money);
  },
  decode: (value) => positiveMoney(value).toWire(),
  validateExpense(row) {
    if (row.amount_type !== "integer" || row.currency !== "DZD") {
      throw new TypeError("Exact expense requires INTEGER minor units and DZD currency");
    }
  },
  validateRevision(row) {
    if (row.new_type !== "integer" || (row.previous_type !== "integer" && row.previous_type !== "null")) {
      throw new TypeError("Exact expense revision requires INTEGER minor units or nullable previous amount");
    }
  },
};

/** Never selected by production dependencies. Only versioned exact schemas can use it. */
export class SqliteExactExpenseRepository extends SqliteExpenseStorage<string> {
  constructor(db: BetterSqliteDatabase, lock: FifoLock) {
    requireExactMoneySchema(db, "expenses");
    for (const [table, column, expected] of [
      ["expense", "amount_minor", "INTEGER"],
      ["expense", "currency", "TEXT"],
      ["expense_revision", "previous_amount_minor", "INTEGER"],
      ["expense_revision", "new_amount_minor", "INTEGER"],
    ]) {
      const columns = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
      if (columns.find((item) => item.name === column)?.type.toUpperCase() !== expected) {
        throw new TypeError(`Exact expense schema requires ${table}.${column} ${expected}`);
      }
    }
    if (db.prepare("SELECT 1 FROM expense WHERE currency IS NULL OR currency <> 'DZD' LIMIT 1").get()) {
      throw new TypeError("Exact expense currency mismatch");
    }
    super(db, lock, exactStorage);
  }
}
