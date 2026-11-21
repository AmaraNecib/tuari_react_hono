import { prepareMoneyRead } from "../../infrastructure/database/exact-money-storage";
import type { FifoLock } from "../../infrastructure/database/fifo-lock";
import { requireExactMoneySchema } from "../../infrastructure/database/money-schema-gate";
import type { BetterSqliteDatabase } from "../../types/sqlite";
import { SqliteCompanyRepository } from "./adapters/sqlite-company.repository";
import { buildCompanyMetadataSystemLogEvents, buildDebtEntrySummary, getDebtEntryTypeLabel, groupCompanySystemLog } from "./company.system-log";
import type { SystemLogListFilters } from "./company.types";

// Every source materialized by the metadata builder and the exact projections is
// budgeted before reading any prefix. Auth labels are bounded by the same budget.
const sources = ["role", "employee", "external_counterparty", "project", "warehouse",
  "employee_state_history", "employee_manager_assignment", "employee_project_assignment",
  "employee_warehouse_assignment", "project_manager_ownership_history",
  "warehouse_manager_ownership_history", "user_profile_history", "inventory_item_definition",
  "user", "debt_account", "debt_entry", "employee_salary_cash"] as const;
const MAX_ROWS = 100_000;

type Attribution = { id: string; actorUserId: string | null; actorLabel: string | null; transactionId: string | null };
type DebtRow = Attribution & { debtAccountId: string; entryType: string; entryDate: string; note: string | null; status: string; voidReason: string | null };
type AccountRow = { id: string; workerId: string | null; externalCounterpartyId: string | null };
type CashRow = Attribution & { employeeId: string; paymentDate: string };

/** Opt-in only. Shares the native handle and FIFO with the selected financial graph. */
export function createExactSystemLogReader(db: BetterSqliteDatabase, lock: FifoLock, options: { maxRows?: number } = {}) {
  const maxRows = options.maxRows ?? MAX_ROWS;
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > MAX_ROWS) throw new RangeError("Invalid system log row budget");
  const metadata = new SqliteCompanyRepository(db, lock);
  const signed = (amount: string) => `${amount.startsWith("-") || amount === "0.00" ? "" : "+"}${amount} دج`;
  function read(filters?: SystemLogListFilters) {
    return lock.runSync(() => {
      // Never join a caller-owned open write transaction and present it as a snapshot.
      if (db.inTransaction) throw new Error("System log requires its own read snapshot");
      return db.transaction(() => {
        requireExactMoneySchema(db, "debt");
        requireExactMoneySchema(db, "workforce");
        let count = 0;
        for (const table of sources) {
          const row = db.prepare(`SELECT count(*) AS count FROM (SELECT 1 FROM "${table}" LIMIT ?)`).get(maxRows + 1) as { count: number };
          count += row.count;
          if (count > maxRows) throw new RangeError("System log materialization limit exceeded");
        }
        const events = buildCompanyMetadataSystemLogEvents(metadata);
        const employees = new Map(metadata.listEmployees().map(row => [row.id, `${row.firstName} ${row.lastName}`]));
        const parties = new Map(metadata.listExternalCounterparties().map(row => [row.id, row.fullName]));
        const accounts = new Map((db.prepare("SELECT id,worker_id AS workerId,external_counterparty_id AS externalCounterpartyId FROM debt_account ORDER BY id").all() as AccountRow[]).map(row => [row.id, row]));
        const currentActor = (id: string | null) => id ? metadata.getAuthUserById(id)?.name ?? id : null;
        const amount = (table: "debt_entry" | "employee_salary_cash", column: string, id: string) => {
          const value = prepareMoneyRead(db, `SELECT ${column} AS minor_units FROM ${table} WHERE id=? AND currency='DZD'`).get(id);
          if (!value) throw new TypeError("Missing exact system log amount");
          return value.toWire();
        };
        const debt = db.prepare("SELECT id,debt_account_id AS debtAccountId,entry_type AS entryType,entry_date AS entryDate,note,status,void_reason AS voidReason,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId FROM debt_entry ORDER BY debt_account_id,posting_sequence,id").all() as DebtRow[];
        for (const row of debt) {
          const account = accounts.get(row.debtAccountId);
          if (!account) throw new Error("System log debt account is missing");
          const label = (account.workerId ? employees.get(account.workerId) : null) ?? (account.externalCounterpartyId ? parties.get(account.externalCounterpartyId) : null) ?? account.id;
          events.push({
            id: `debt-entry-${row.id}`, transactionId: row.transactionId, actorUserId: row.actorUserId,
            actorLabel: row.actorLabel, actorCurrentLabel: currentActor(row.actorUserId),
            actionType: row.entryType === "SETTLEMENT" ? "DEBT_SETTLED" : "DEBT_ENTRY_RECORDED",
            entityType: "DEBT_ENTRY", entityId: row.id, entityLabel: label,
            summary: buildDebtEntrySummary(row.entryType, label),
            // balance_after is a mutable re-projection, not a historical balance.
            detail: [`نوع الحركة ${getDebtEntryTypeLabel(row.entryType)}`, `القيمة ${signed(amount("debt_entry", "signed_amount_minor", row.id))}`, row.note,
              row.status === "VOIDED" ? `VOIDED: ${row.voidReason ?? ""}` : null].filter(Boolean).join(" • "),
            createdAt: row.entryDate,
          });
        }
        const cash = db.prepare("SELECT id,employee_id AS employeeId,payment_date AS paymentDate,actor_user_id AS actorUserId,actor_label AS actorLabel,transaction_id AS transactionId FROM employee_salary_cash ORDER BY created_at,id").all() as CashRow[];
        for (const row of cash) {
          const label = employees.get(row.employeeId) ?? null;
          events.push({ id: `salary-payment-${row.id}`, transactionId: row.transactionId, actorUserId: row.actorUserId,
            actorLabel: row.actorLabel, actorCurrentLabel: currentActor(row.actorUserId),
            actionType: "SALARY_PAYMENT_RECORDED", entityType: "SALARY_PAYMENT", entityId: row.id, entityLabel: label,
            summary: `تم تسجيل دفعة راتب للعامل ${label ?? row.employeeId}`,
            detail: `المبلغ المدفوع ${amount("employee_salary_cash", "amount_minor", row.id)} دج`, createdAt: row.paymentDate });
        }
        // Deterministic ties independent of SQL planner/index choices.
        const families = ["employee-state-", "manager-assignment-", "project-assignment-", "warehouse-assignment-",
          "project-manager-history-", "warehouse-manager-history-", "salary-payment-", "debt-entry-", "user-profile-", "inventory-item-"];
        const rank = (id: string) => families.findIndex(prefix => id.startsWith(prefix));
        events.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id, "en"));
        return groupCompanySystemLog(events, filters);
      })();
    });
  }
  return {
    listSystemLog: read,
    listSystemLogPage(filters: SystemLogListFilters | undefined, page: { offset: number; limit: number }) {
      if (!Number.isSafeInteger(page.offset) || page.offset < 0 || !Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > MAX_ROWS) throw new RangeError("Invalid system log page");
      const { items } = read(filters);
      return { items: items.slice(page.offset, page.offset + page.limit), totalCount: items.length };
    },
  };
}

export type ExactSystemLogReader = ReturnType<typeof createExactSystemLogReader>;
