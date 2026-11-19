/** Isolated fresh-copy DDL. Production startup does not import this preparation. */
export const payrollCashSchemaStatements: readonly string[] = [
  `CREATE TABLE employee_salary_cash (
    id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employee(id), currency TEXT NOT NULL CHECK(currency='DZD'),
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 9223372036854775807),
    payment_date TEXT NOT NULL, actor_user_id TEXT NOT NULL, actor_label TEXT, transaction_id TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE employee_salary_payment_allocation (
    cash_id TEXT NOT NULL REFERENCES employee_salary_cash(id), id TEXT PRIMARY KEY,
    ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 0 AND 9999),
    source_kind TEXT NOT NULL CHECK(source_kind IN ('EARNING','OPENING')), source_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 9223372036854775807),
    debt_account_id TEXT NOT NULL REFERENCES debt_account(id), debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id),
    payment_entry_id TEXT NOT NULL REFERENCES debt_entry(id), UNIQUE(cash_id,ordinal), UNIQUE(cash_id,source_kind,source_id)
  )`,
  `CREATE TABLE employee_salary_advance (
    id TEXT PRIMARY KEY, cash_id TEXT NOT NULL UNIQUE REFERENCES employee_salary_cash(id),
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 9223372036854775807),
    debt_account_id TEXT NOT NULL REFERENCES debt_account(id), debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id)
  )`,
  `CREATE TRIGGER payroll_cash_allocation_link_insert BEFORE INSERT ON employee_salary_payment_allocation
   WHEN NOT EXISTS (SELECT 1 FROM debt_entry original JOIN debt_entry payment ON payment.id=NEW.payment_entry_id
     WHERE original.id=NEW.debt_entry_id AND original.debt_account_id=NEW.debt_account_id
       AND original.target_entry_id IS NULL AND original.correction_of_entry_id IS NULL AND original.status='LIVE'
       AND original.producer_type=CASE NEW.source_kind WHEN 'EARNING' THEN 'PAYROLL_EARNINGS' ELSE 'PAYROLL_OPENING' END
       AND original.producer_id=NEW.source_id AND payment.debt_account_id=NEW.debt_account_id
       AND payment.target_entry_id=original.id AND payment.entry_type='PAYMENT' AND payment.status='LIVE'
       AND EXISTS (SELECT 1 FROM employee_salary_cash cash JOIN debt_account account ON account.id=NEW.debt_account_id WHERE cash.id=NEW.cash_id AND account.direction='PAYABLE' AND account.worker_id=cash.employee_id AND account.currency=cash.currency))
   BEGIN SELECT RAISE(ABORT,'Payroll cash allocation source link mismatch'); END`,
  `CREATE TRIGGER payroll_cash_advance_link_insert BEFORE INSERT ON employee_salary_advance
   WHEN NOT EXISTS (SELECT 1 FROM employee_salary_cash cash JOIN debt_entry original ON original.id=NEW.debt_entry_id
     JOIN debt_account account ON account.id=NEW.debt_account_id
     WHERE cash.id=NEW.cash_id AND original.debt_account_id=NEW.debt_account_id
       AND original.target_entry_id IS NULL AND original.correction_of_entry_id IS NULL AND original.status='LIVE' AND original.producer_type='PAYROLL_ADVANCE'
       AND original.producer_id=NEW.id AND account.direction='RECEIVABLE' AND account.worker_id=cash.employee_id)
   BEGIN SELECT RAISE(ABORT,'Payroll cash advance source link mismatch'); END`,
  ...["employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance"].flatMap(table => [
    `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Payroll cash provenance is immutable'); END`,
    `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Payroll cash provenance is immutable'); END`,
  ]),
  `CREATE TRIGGER employee_salary_cash_no_replace BEFORE INSERT ON employee_salary_cash
   WHEN EXISTS(SELECT 1 FROM employee_salary_cash WHERE id=NEW.id)
   BEGIN SELECT RAISE(ABORT,'Payroll cash identity already exists'); END`,
  `CREATE TRIGGER employee_salary_payment_allocation_no_replace BEFORE INSERT ON employee_salary_payment_allocation
   WHEN EXISTS(SELECT 1 FROM employee_salary_payment_allocation WHERE id=NEW.id OR (cash_id=NEW.cash_id AND ordinal=NEW.ordinal) OR (cash_id=NEW.cash_id AND source_kind=NEW.source_kind AND source_id=NEW.source_id))
   BEGIN SELECT RAISE(ABORT,'Payroll cash allocation identity already exists'); END`,
  `CREATE TRIGGER employee_salary_advance_no_replace BEFORE INSERT ON employee_salary_advance
   WHEN EXISTS(SELECT 1 FROM employee_salary_advance WHERE id=NEW.id OR cash_id=NEW.cash_id)
   BEGIN SELECT RAISE(ABORT,'Payroll cash advance identity already exists'); END`,
];
