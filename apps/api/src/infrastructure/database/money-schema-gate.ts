import type { DbExecutor } from "./schema";
import type { BetterSqliteDatabase } from "../../types/sqlite";

export type ExactMoneySlice = "debt" | "expenses" | "invoice" | "inventory" | "workforce";
const ACTIVATION_REQUIRED = "Exact money requires coordinated schema, reader, writer and contract activation; legacy startup is disabled for this database";

/** Reject unsupported converted copies before initialization or financial composition. */
const workforceColumns = {
  employee: { salary_reference_period: "TEXT", salary_reference_amount: "TEXT" },
  employee_state_history: { salary_reference_period: "TEXT", salary_reference_amount: "TEXT" },
  employee_earning: {
    id: "TEXT", employee_id: "TEXT", request_id: "TEXT", request_hash: "TEXT", period_start: "DATETIME", period_end: "DATETIME",
    currency_code: "TEXT", total_minor: "INTEGER", unallocated_minor: "INTEGER", reference_salary_period: "TEXT",
    reference_salary_units: "INTEGER", approved_at: "DATETIME", created_at: "DATETIME",
  },
  employee_earning_segment: {
    id: "TEXT", earning_id: "TEXT", project_id: "TEXT", ordinal: "INTEGER", days: "INTEGER", amount_minor: "INTEGER", created_at: "DATETIME",
  },
} as const;

export async function assertWorkforcePhysicalSchema(db: DbExecutor): Promise<void> {
  for (const [table, expected] of Object.entries(workforceColumns)) {
    const columns = await db.$queryRawUnsafe<{ name: string; type: string }[]>(`PRAGMA table_info("${table}")`);
    const byName = new Map(columns.map(column => [column.name, column.type.toUpperCase()]));
    if (Object.entries(expected).some(([name, type]) => byName.get(name) !== type)) throw new Error(ACTIVATION_REQUIRED);
  }
}

async function assertSupportedWorkforceSchema(db: DbExecutor): Promise<void> {
  const marker = await db.$queryRawUnsafe<{ type: string }[]>(
    "SELECT type FROM sqlite_master WHERE lower(name) = 'exact_money_schema'",
  );
  if (marker.length !== 1 || marker[0]?.type !== "table") throw new Error(ACTIVATION_REQUIRED);
  const markerColumns = await db.$queryRawUnsafe<{ name: string; type: string; pk: number; notnull: number }[]>("PRAGMA table_info(exact_money_schema)");
  if (markerColumns.length !== 2
    || !markerColumns.some(column => column.name === "slice" && column.type.toUpperCase() === "TEXT" && column.pk === 1)
    || !markerColumns.some(column => column.name === "version" && column.type.toUpperCase() === "INTEGER" && column.notnull === 1 && column.pk === 0)) {
    throw new Error(ACTIVATION_REQUIRED);
  }
  const rows = await db.$queryRawUnsafe<{ slice: string; version: number }[]>("SELECT slice, version FROM exact_money_schema");
  if (rows.length !== 1 || rows[0]?.slice !== "workforce" || rows[0]?.version !== 1) throw new Error(ACTIVATION_REQUIRED);

  await assertWorkforcePhysicalSchema(db);
}

export async function assertLegacyMoneySchema(db: DbExecutor): Promise<void> {
  const markers = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE lower(name) = 'exact_money_schema'",
  );
  if (markers.length) await assertSupportedWorkforceSchema(db);

  const payrollSentinels = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE lower(name) IN ('employee_salary_earning','employee_salary_earning_segment','employee_salary_correction','employee_salary_opening_review','employee_salary_advance','employee_salary_payment_allocation','employee_salary_settlement')",
  );
  if (payrollSentinels.length) throw new Error(ACTIVATION_REQUIRED);

  const legacyMoneyColumns = {
    invoice: ["total_amount", "paid_amount", "remaining_amount"],
    invoice_line_item: ["unit_price", "total"],
    payment: ["total_amount", "amount_dzd"],
    payment_allocation: ["amount", "amount_dzd"],
    employee: ["salary_amount_dzd"],
    employee_state_history: ["salary_amount_dzd"],
    employee_salary_payment: ["expected_amount_dzd", "actual_amount_dzd"],
    inventory_invoice_group: ["gross_total_dzd", "paid_amount_dzd", "remaining_debt_dzd"],
    inventory_entry: ["unit_price_dzd", "total_price_dzd"],
    inventory_asset_unit: ["purchase_price_dzd"],
    inventory_outbound_transfer_item: ["unit_price_dzd"],
    inventory_asset_charge: ["amount_dzd"],
    inventory_asset_charge_revision: ["previous_amount_dzd", "new_amount_dzd"],
    debt_account: ["current_balance", "current_balance_dzd"],
    debt_entry: ["signed_amount", "balance_after", "signed_amount_dzd", "balance_after_dzd"],
    expense: ["amount_dzd"],
    expense_revision: ["previous_amount_dzd", "new_amount_dzd"],
  } as const;
  for (const [table, legacyNames] of Object.entries(legacyMoneyColumns)) {
    const columns = await db.$queryRawUnsafe<{ name: string; type: string }[]>(`PRAGMA table_xinfo("${table}")`);
    for (const column of columns) {
      const name = column.name.toLowerCase();
      const isLegacyMoney = (legacyNames as readonly string[]).includes(name);
      if (name.endsWith("_minor") || name === "salary_reference_units" || name === "unit_price_units" || name === "price_source" || (isLegacyMoney && column.type.toUpperCase() !== "REAL")) {
        throw new Error(ACTIVATION_REQUIRED);
      }
    }
  }
}

/** Opt-in adapter prerequisite only. Adapters must also validate their physical columns. */
export function requireExactMoneySchema(db: BetterSqliteDatabase, slice: ExactMoneySlice): void {
  if (!["debt", "expenses", "invoice", "inventory", "workforce"].includes(slice)) throw new TypeError("Unknown exact money slice");
  const marker = db.prepare("SELECT type FROM sqlite_master WHERE lower(name) = 'exact_money_schema'").get() as { type: string } | undefined;
  if (marker?.type !== "table") throw new Error("Exact money schema marker is required");
  const columns = db.pragma("table_info(exact_money_schema)") as { name: string; type: string; pk: number; notnull: number }[];
  const identity = columns.find(column => column.name === "slice");
  const version = columns.find(column => column.name === "version");
  if (columns.length !== 2 || identity?.type.toUpperCase() !== "TEXT" || identity.pk !== 1
    || version?.type.toUpperCase() !== "INTEGER" || version.notnull !== 1 || version.pk !== 0) {
    throw new Error("Malformed exact money schema marker");
  }
  const row = db.prepare("SELECT version FROM exact_money_schema WHERE slice = ?").get(slice) as { version: unknown } | undefined;
  if (row?.version !== 1) throw new Error("Exact money schema version 1 is required for this slice");
}
