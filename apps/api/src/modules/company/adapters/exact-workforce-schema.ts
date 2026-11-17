/** Fresh exact employee-profile DDL. Earnings have their own scoped DDL. */
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
  `CREATE INDEX exact_employee_history_employee_idx ON employee_state_history(employee_id,start_date,id)`,
] as const;

/** Normal startup installs only profile/reference/history tables; earnings use their own DDL. */
export const exactEmployeeProfileSchemaStatements = exactWorkforceSchemaStatements.filter(sql =>
  /^CREATE TABLE employee(?:_state_history)? \(/.test(sql),
);
