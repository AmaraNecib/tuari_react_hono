/** Shared insert/read predicates keep physical attribution checks consistent. */
export const payrollAllocationLink = `EXISTS (
  SELECT 1 FROM employee_salary_cash cash
  JOIN debt_account account ON account.id=candidate.debt_account_id
  JOIN debt_entry original ON original.id=candidate.debt_entry_id
  JOIN debt_entry payment ON payment.id=candidate.payment_entry_id
  WHERE cash.id=candidate.cash_id AND account.party_type='INTERNAL_WORKER'
    AND account.worker_id=cash.employee_id AND account.direction='PAYABLE' AND account.currency=cash.currency
    AND original.debt_account_id=account.id AND original.currency=cash.currency AND original.status='LIVE'
    AND original.target_entry_id IS NULL AND original.correction_of_entry_id IS NULL AND original.signed_amount_minor>0
    AND original.producer_type=CASE candidate.source_kind WHEN 'EARNING' THEN 'PAYROLL_EARNINGS' ELSE 'PAYROLL_OPENING' END
    AND original.producer_id=candidate.source_id
    AND payment.debt_account_id=account.id AND payment.currency=cash.currency AND payment.status='LIVE'
    AND payment.target_entry_id=original.id AND payment.correction_of_entry_id IS NULL AND payment.entry_type='PAYMENT'
    AND payment.producer_type=original.producer_type AND payment.producer_id=original.producer_id
    AND payment.signed_amount_minor=-candidate.amount_minor)`;
export const payrollAdvanceLink = `EXISTS (
  SELECT 1 FROM employee_salary_cash cash
  JOIN debt_account account ON account.id=candidate.debt_account_id
  JOIN debt_entry original ON original.id=candidate.debt_entry_id
  WHERE cash.id=candidate.cash_id AND account.party_type='INTERNAL_WORKER'
    AND account.worker_id=cash.employee_id AND account.direction='RECEIVABLE' AND account.currency=cash.currency
    AND original.debt_account_id=account.id AND original.currency=cash.currency AND original.status='LIVE'
    AND original.target_entry_id IS NULL AND original.correction_of_entry_id IS NULL
    AND original.entry_type='ADVANCE' AND original.producer_type='PAYROLL_ADVANCE' AND original.producer_id=candidate.id
    AND original.signed_amount_minor=candidate.amount_minor)`;
export const payrollSettlementLink = `EXISTS (
  SELECT 1 FROM debt_account account
  JOIN debt_entry original ON original.id=candidate.debt_entry_id
  JOIN debt_entry payment ON payment.id=candidate.payment_entry_id
  WHERE account.id=candidate.debt_account_id AND account.party_type='INTERNAL_WORKER'
    AND account.worker_id=candidate.employee_id AND account.direction='RECEIVABLE' AND account.currency=candidate.currency
    AND original.debt_account_id=account.id AND original.currency=candidate.currency AND original.status='LIVE'
    AND original.target_entry_id IS NULL AND original.correction_of_entry_id IS NULL AND original.signed_amount_minor>0
    AND original.producer_type=CASE candidate.source_kind WHEN 'ADVANCE' THEN 'PAYROLL_ADVANCE' ELSE 'PAYROLL_OPENING' END
    AND original.producer_id=candidate.source_id
    AND (candidate.source_kind='OPENING_ADVANCE' OR (original.entry_type='ADVANCE' AND EXISTS (
      SELECT 1 FROM employee_salary_advance advance JOIN employee_salary_cash cash ON cash.id=advance.cash_id
      WHERE advance.id=candidate.source_id AND advance.debt_account_id=account.id AND advance.debt_entry_id=original.id
        AND cash.employee_id=candidate.employee_id AND cash.currency=candidate.currency AND advance.amount_minor=original.signed_amount_minor)))
    AND payment.debt_account_id=account.id AND payment.currency=candidate.currency AND payment.status='LIVE'
    AND payment.target_entry_id=original.id AND payment.correction_of_entry_id IS NULL AND payment.entry_type='PAYMENT'
    AND payment.producer_type=original.producer_type AND payment.producer_id=original.producer_id
    AND payment.signed_amount_minor=-candidate.amount_minor)`;

const amount = "INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 9223372036854775807)";
const audit = "actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL";
const debtLinks = "debt_account_id TEXT NOT NULL REFERENCES debt_account(id) ON DELETE RESTRICT, debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id) ON DELETE RESTRICT";
const tables = ["employee_salary_cash", "employee_salary_payment_allocation", "employee_salary_advance", "employee_salary_settlement"] as const;
const noReplace = (table: string, collision: string) => `CREATE TRIGGER ${table}_no_replace BEFORE INSERT ON ${table}
  WHEN EXISTS(SELECT 1 FROM ${table} WHERE ${collision}) BEGIN SELECT RAISE(ABORT,'Payroll cash identity already exists'); END`;

/** Prepared exact copies only. Never imported by the production initializer. */
export const payrollCashSchemaStatements: readonly string[] = [
  `CREATE TABLE employee_salary_cash (
    id TEXT NOT NULL PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK(currency='DZD'), amount_minor ${amount}, payment_date TEXT NOT NULL, ${audit})`,
  `CREATE TABLE employee_salary_payment_allocation (
    cash_id TEXT NOT NULL REFERENCES employee_salary_cash(id) ON DELETE RESTRICT, id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK(typeof(ordinal)='integer' AND ordinal BETWEEN 0 AND 9999),
    source_kind TEXT NOT NULL CHECK(source_kind IN ('EARNING','OPENING')), source_id TEXT NOT NULL,
    amount_minor ${amount}, ${debtLinks}, payment_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    PRIMARY KEY(cash_id,id), UNIQUE(cash_id,ordinal))`,
  `CREATE TABLE employee_salary_advance (
    id TEXT NOT NULL PRIMARY KEY, cash_id TEXT NOT NULL UNIQUE REFERENCES employee_salary_cash(id) ON DELETE RESTRICT,
    amount_minor ${amount}, ${debtLinks}, UNIQUE(debt_entry_id))`,
  `CREATE TABLE employee_salary_settlement (
    id TEXT NOT NULL PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK(currency='DZD'), source_kind TEXT NOT NULL CHECK(source_kind IN ('ADVANCE','OPENING_ADVANCE')),
    source_id TEXT NOT NULL, amount_minor ${amount}, payment_date TEXT NOT NULL, ${debtLinks},
    payment_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT, ${audit})`,
  ...[["employee_salary_payment_allocation", payrollAllocationLink], ["employee_salary_advance", payrollAdvanceLink], ["employee_salary_settlement", payrollSettlementLink]].map(([table, predicate]) =>
    `CREATE TRIGGER ${table}_link_insert BEFORE INSERT ON ${table} WHEN NOT ${predicate!.replaceAll("candidate.", "NEW.")}
      BEGIN SELECT RAISE(ABORT,'Payroll cash source link mismatch'); END`),
  ...tables.flatMap(table => [
    `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Payroll cash provenance is immutable'); END`,
    `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Payroll cash provenance is immutable'); END`,
  ]),
  noReplace("employee_salary_cash", "id=NEW.id"),
  noReplace("employee_salary_payment_allocation", "(cash_id=NEW.cash_id AND (id=NEW.id OR ordinal=NEW.ordinal)) OR payment_entry_id=NEW.payment_entry_id"),
  noReplace("employee_salary_advance", "id=NEW.id OR cash_id=NEW.cash_id OR debt_entry_id=NEW.debt_entry_id"),
  noReplace("employee_salary_settlement", "id=NEW.id OR payment_entry_id=NEW.payment_entry_id"),
  "CREATE INDEX payroll_cash_employee ON employee_salary_cash(employee_id,created_at,id)",
  "CREATE INDEX payroll_settlement_employee ON employee_salary_settlement(employee_id,created_at,id)",
];
