import type { SeedDatabase } from "./db-seed"

const TRANSACTIONAL_TABLES = [
  "session", "verification", "user_profile_history", "user", "account", "app_bootstrap_state",
  "employee_state_history", "employee_warehouse_assignment", "employee_project_assignment", "employee_manager_assignment",
  "employee_salary_earning_segment", "employee_salary_earning", "employee",
  "project_manager_ownership_history", "warehouse_manager_ownership_history", "project", "warehouse",
  "debt_entry", "debt_account", "debt_command", "exact_finance_command", "external_counterparty", "invoice", "recovery_key",
] as const
const PRESERVED_TABLES = ["role", "role_permission", "app_schema_state", "exact_money_schema", "exact_workspace_identity"] as const

export function resetExactFixture(db: SeedDatabase, known: Set<string>): void {
  const expected = new Set<string>([...TRANSACTIONAL_TABLES, ...PRESERVED_TABLES])
  for (const table of expected) {
    if (!known.has(table)) throw new Error(`resetE2eDatabase: missing exact table "${table}"`)
  }
  const unexpected = [...known].filter(table => !table.startsWith("sqlite_") && !expected.has(table))
  if (unexpected.length) throw new Error(`resetE2eDatabase: unexpected exact tables: ${unexpected.join(", ")}`)
  const markers = db.prepare("SELECT slice,version FROM exact_money_schema ORDER BY slice").all() as Array<{ slice: string; version: number }>
  if (JSON.stringify(markers) !== JSON.stringify([{ slice: "debt", version: 1 }, { slice: "workforce", version: 1 }])) {
    throw new Error("resetE2eDatabase: unsupported exact schema markers")
  }
  const placeholders = TRANSACTIONAL_TABLES.map(() => "?").join(",")
  const objects = db.prepare(
    `SELECT type,sql FROM sqlite_master WHERE tbl_name IN (${placeholders}) AND sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name`,
  ).all(...TRANSACTIONAL_TABLES) as Array<{ type: string; sql: string }>
  // Approved earnings reject DELETE. Rebuild only disposable fixture tables,
  // then restore their original indexes and triggers in the same transaction.
  db.pragma("foreign_keys = OFF")
  db.exec("BEGIN IMMEDIATE")
  try {
    for (const table of TRANSACTIONAL_TABLES) db.exec(`DROP TABLE "${table}"`)
    for (const object of objects) db.exec(object.sql)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.pragma("foreign_keys = ON")
  }
}
