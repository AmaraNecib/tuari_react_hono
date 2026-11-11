/** Fresh exact workforce DDL. Composition selects it explicitly; never a legacy migration. */
const referenceColumns = `salary_reference_units INTEGER CHECK(salary_reference_units IS NULL OR (typeof(salary_reference_units)='integer' AND salary_reference_units >= 0)),
  salary_period TEXT,
  salary_currency TEXT NOT NULL DEFAULT 'DZD' CHECK(salary_currency='DZD')`;
const referencePair = `CHECK((salary_reference_units IS NULL AND salary_period IS NULL) OR
  (salary_reference_units IS NOT NULL AND salary_period IS NOT NULL AND salary_period IN ('DAILY','MONTHLY','WEEKLY')))`;

export const exactWorkforceSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)`,
  `INSERT INTO exact_money_schema(slice,version) VALUES ('workforce',1)`,
  `CREATE TABLE employee (
    id TEXT NOT NULL PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
    user_id TEXT UNIQUE REFERENCES user(id) ON DELETE SET NULL ON UPDATE CASCADE,
    role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE','LEFT')),
    ${referenceColumns}, notes TEXT, occupation TEXT, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
    ${referencePair}
  )`,
  `CREATE TABLE employee_state_history (
    id TEXT NOT NULL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    role_id TEXT NOT NULL REFERENCES role(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status TEXT NOT NULL, ${referenceColumns}, event_type TEXT NOT NULL,
    start_date DATETIME NOT NULL, end_date DATETIME, notes TEXT,
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT,
    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
    ${referencePair}
  )`,
  `CREATE TABLE employee_salary_payment (
    id TEXT NOT NULL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    period_type TEXT NOT NULL CHECK(period_type IN ('DAILY','MONTHLY','WEEKLY')),
    days INTEGER NOT NULL DEFAULT 30 CHECK(typeof(days)='integer' AND days > 0 AND days <= 9007199254740991),
    expected_amount_minor INTEGER NOT NULL CHECK(typeof(expected_amount_minor)='integer' AND expected_amount_minor >= 0),
    actual_amount_minor INTEGER NOT NULL CHECK(typeof(actual_amount_minor)='integer' AND actual_amount_minor >= 0),
    currency TEXT NOT NULL DEFAULT 'DZD' CHECK(currency='DZD'),
    payment_date DATETIME NOT NULL, note TEXT, actor_user_id TEXT, actor_label TEXT, transaction_id TEXT,
    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
  )`,
  `CREATE TABLE employee_salary_payment_split (
    id TEXT NOT NULL PRIMARY KEY,
    payment_id TEXT NOT NULL REFERENCES employee_salary_payment(id) ON DELETE CASCADE ON UPDATE CASCADE,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    days INTEGER NOT NULL CHECK(typeof(days)='integer' AND days > 0 AND days <= 9007199254740991),
    created_at DATETIME NOT NULL
  )`,
  `CREATE TABLE employee_salary_settlement (
    id TEXT NOT NULL PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK(currency='DZD'), source_kind TEXT NOT NULL CHECK(source_kind IN ('ADVANCE','OPENING_ADVANCE')), source_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0), payment_date TEXT NOT NULL,
    debt_account_id TEXT NOT NULL REFERENCES debt_account(id) ON DELETE RESTRICT,
    debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id) ON DELETE RESTRICT,
    payment_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX exact_employee_settlement_employee_idx ON employee_salary_settlement(employee_id,created_at,id)`,
  `CREATE TRIGGER employee_salary_settlement_no_replace BEFORE INSERT ON employee_salary_settlement
    WHEN EXISTS(SELECT 1 FROM employee_salary_settlement WHERE id=NEW.id OR payment_entry_id=NEW.payment_entry_id)
    BEGIN SELECT RAISE(ABORT,'Payroll settlement source is immutable'); END`,
  `CREATE TABLE employee_salary_opening_review (
    id TEXT NOT NULL PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK(currency='DZD'), status TEXT NOT NULL CHECK(status IN ('UNREVIEWED','REVIEWED')),
    wages_owed_minor INTEGER CHECK(wages_owed_minor IS NULL OR (typeof(wages_owed_minor)='integer' AND wages_owed_minor>=0)),
    advances_owed_minor INTEGER CHECK(advances_owed_minor IS NULL OR (typeof(advances_owed_minor)='integer' AND advances_owed_minor>=0)),
    wage_debt_account_id TEXT REFERENCES debt_account(id) ON DELETE RESTRICT,
    wage_debt_entry_id TEXT UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    advance_debt_account_id TEXT REFERENCES debt_account(id) ON DELETE RESTRICT,
    advance_debt_entry_id TEXT UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL,
    CHECK((status='UNREVIEWED' AND wages_owed_minor IS NULL AND advances_owed_minor IS NULL AND wage_debt_account_id IS NULL AND wage_debt_entry_id IS NULL AND advance_debt_account_id IS NULL AND advance_debt_entry_id IS NULL)
      OR (status='REVIEWED' AND wages_owed_minor IS NOT NULL AND advances_owed_minor IS NOT NULL
        AND ((wages_owed_minor=0 AND wage_debt_account_id IS NULL AND wage_debt_entry_id IS NULL) OR (wages_owed_minor>0 AND wage_debt_account_id IS NOT NULL AND wage_debt_entry_id IS NOT NULL))
        AND ((advances_owed_minor=0 AND advance_debt_account_id IS NULL AND advance_debt_entry_id IS NULL) OR (advances_owed_minor>0 AND advance_debt_account_id IS NOT NULL AND advance_debt_entry_id IS NOT NULL))))
  )`,
  `CREATE UNIQUE INDEX exact_employee_opening_once_idx ON employee_salary_opening_review(employee_id) WHERE status='REVIEWED'`,
  `CREATE INDEX exact_employee_opening_employee_idx ON employee_salary_opening_review(employee_id,created_at,id)`,
  `CREATE TABLE employee_salary_cash (
    id TEXT NOT NULL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK(currency='DZD'),
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
    payment_date TEXT NOT NULL, actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE employee_salary_payment_allocation (
    cash_id TEXT NOT NULL REFERENCES employee_salary_cash(id) ON DELETE RESTRICT,
    id TEXT NOT NULL, ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal>=0),
    source_kind TEXT NOT NULL CHECK(source_kind IN ('EARNING','OPENING')), source_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
    debt_account_id TEXT NOT NULL REFERENCES debt_account(id) ON DELETE RESTRICT,
    debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id) ON DELETE RESTRICT,
    payment_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    PRIMARY KEY(cash_id,id), UNIQUE(cash_id,ordinal)
  )`,
  `CREATE TABLE employee_salary_advance (
    id TEXT NOT NULL PRIMARY KEY, cash_id TEXT NOT NULL UNIQUE REFERENCES employee_salary_cash(id) ON DELETE RESTRICT,
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor>0),
    debt_account_id TEXT NOT NULL REFERENCES debt_account(id) ON DELETE RESTRICT,
    debt_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX exact_employee_salary_cash_employee_idx ON employee_salary_cash(employee_id,created_at,id)`,
  ...["employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance", "employee_salary_opening_review", "employee_salary_settlement"].flatMap(table => [
    `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Payroll cash source is immutable'); END`,
    `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Payroll cash source is immutable'); END`,
  ]),
  `CREATE TRIGGER employee_salary_opening_no_replace BEFORE INSERT ON employee_salary_opening_review
    WHEN EXISTS(SELECT 1 FROM employee_salary_opening_review WHERE id=NEW.id OR (employee_id=NEW.employee_id AND status='REVIEWED' AND NEW.status='REVIEWED') OR (NEW.wage_debt_entry_id IS NOT NULL AND wage_debt_entry_id=NEW.wage_debt_entry_id) OR (NEW.advance_debt_entry_id IS NOT NULL AND advance_debt_entry_id=NEW.advance_debt_entry_id))
    BEGIN SELECT RAISE(ABORT,'Payroll opening source is immutable'); END`,
  `CREATE TRIGGER employee_salary_cash_no_replace BEFORE INSERT ON employee_salary_cash
    WHEN EXISTS(SELECT 1 FROM employee_salary_cash WHERE id=NEW.id)
    BEGIN SELECT RAISE(ABORT,'Payroll cash source is immutable'); END`,
  `CREATE TRIGGER employee_salary_allocation_no_replace BEFORE INSERT ON employee_salary_payment_allocation
    WHEN EXISTS(SELECT 1 FROM employee_salary_payment_allocation WHERE (cash_id=NEW.cash_id AND (id=NEW.id OR ordinal=NEW.ordinal)) OR payment_entry_id=NEW.payment_entry_id)
    BEGIN SELECT RAISE(ABORT,'Payroll cash source is immutable'); END`,
  `CREATE TRIGGER employee_salary_advance_no_replace BEFORE INSERT ON employee_salary_advance
    WHEN EXISTS(SELECT 1 FROM employee_salary_advance WHERE id=NEW.id OR cash_id=NEW.cash_id OR debt_entry_id=NEW.debt_entry_id)
    BEGIN SELECT RAISE(ABORT,'Payroll cash source is immutable'); END`,
  `CREATE INDEX exact_employee_history_employee_idx ON employee_state_history(employee_id,start_date,id)`,
  `CREATE INDEX exact_employee_salary_payment_employee_idx ON employee_salary_payment(employee_id,payment_date,id)`,
  `CREATE INDEX exact_employee_salary_split_payment_idx ON employee_salary_payment_split(payment_id,id)`,
] as const;
