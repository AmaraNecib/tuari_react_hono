/** Isolated exact-copy fixtures only. Not a migration, initializer or production activation. */
export const exactWorkforceEarningSchemaStatements = [
  `CREATE TABLE employee_salary_earning (
    id TEXT PRIMARY KEY NOT NULL,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK(currency='DZD'),
    period_start TEXT NOT NULL, period_end TEXT NOT NULL CHECK(period_end>=period_start),
    approved_amount_minor INTEGER NOT NULL CHECK(typeof(approved_amount_minor)='integer' AND approved_amount_minor>=0),
    unallocated_amount_minor INTEGER NOT NULL CHECK(typeof(unallocated_amount_minor)='integer' AND unallocated_amount_minor BETWEEN 0 AND approved_amount_minor),
    debt_account_id TEXT REFERENCES debt_account(id) ON DELETE RESTRICT,
    debt_entry_id TEXT UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL,
    CHECK((approved_amount_minor=0 AND debt_account_id IS NULL AND debt_entry_id IS NULL) OR
      (approved_amount_minor>0 AND debt_account_id IS NOT NULL AND debt_entry_id IS NOT NULL))
  )`,
  `CREATE TABLE employee_salary_earning_segment (
    earning_id TEXT NOT NULL REFERENCES employee_salary_earning(id) ON DELETE RESTRICT,
    id TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 0 AND 9999),
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>=0),
    days INTEGER CHECK(days IS NULL OR (typeof(days)='integer' AND days BETWEEN 1 AND 9007199254740991)),
    PRIMARY KEY(earning_id,id), UNIQUE(earning_id,ordinal)
  )`,
  "CREATE INDEX exact_salary_earning_employee ON employee_salary_earning(employee_id,created_at,id)",
  `CREATE TRIGGER exact_salary_earning_original BEFORE INSERT ON employee_salary_earning
    WHEN NEW.debt_entry_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM debt_entry e JOIN debt_account a ON a.id=e.debt_account_id
      WHERE e.id=NEW.debt_entry_id AND a.id=NEW.debt_account_id AND a.worker_id=NEW.employee_id
        AND a.party_type='INTERNAL_WORKER' AND a.direction='PAYABLE' AND a.currency=NEW.currency
        AND e.currency=NEW.currency AND e.producer_type='PAYROLL_EARNINGS' AND e.producer_id=NEW.id
        AND e.signed_amount_minor=NEW.approved_amount_minor AND e.status='LIVE'
        AND e.target_entry_id IS NULL AND e.correction_of_entry_id IS NULL
    ) BEGIN SELECT RAISE(ABORT,'Earning requires its matching payroll original'); END`,
  `CREATE TRIGGER exact_salary_earning_no_replace BEFORE INSERT ON employee_salary_earning
    WHEN EXISTS (SELECT 1 FROM employee_salary_earning WHERE id=NEW.id OR debt_entry_id=NEW.debt_entry_id)
    BEGIN SELECT RAISE(ABORT,'Approved earning is immutable'); END`,
  `CREATE TRIGGER exact_salary_segment_no_replace BEFORE INSERT ON employee_salary_earning_segment
    WHEN EXISTS (SELECT 1 FROM employee_salary_earning_segment WHERE earning_id=NEW.earning_id AND (id=NEW.id OR ordinal=NEW.ordinal))
    BEGIN SELECT RAISE(ABORT,'Approved earning is immutable'); END`,
  ...["employee_salary_earning", "employee_salary_earning_segment"].flatMap(table =>
    ["UPDATE", "DELETE"].map(operation =>
      `CREATE TRIGGER ${table}_${operation.toLowerCase()}_immutable BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Approved earning is immutable'); END`)),
] as const;
