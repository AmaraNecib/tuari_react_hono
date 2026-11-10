/** Fresh isolated copy fixtures only. Not a migration, startup initializer or activation. */
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
  `CREATE INDEX exact_employee_history_employee_idx ON employee_state_history(employee_id,start_date,id)`,
  `CREATE INDEX exact_employee_salary_payment_employee_idx ON employee_salary_payment(employee_id,payment_date,id)`,
  `CREATE INDEX exact_employee_salary_split_payment_idx ON employee_salary_payment_split(payment_id,id)`,
] as const;
