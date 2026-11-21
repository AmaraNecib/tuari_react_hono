/** Insert and hydration require real current sources. Opening kinds remain
 * reserved in the shape but fail closed until a reviewed provider is integrated. */
export const payrollOffsetLink = `EXISTS (
  SELECT 1 FROM debt_entry wage_original
  JOIN debt_account wage_account ON wage_account.id=candidate.wage_debt_account_id
  JOIN debt_entry wage_settlement ON wage_settlement.id=candidate.wage_settlement_entry_id
  JOIN debt_entry advance_original ON advance_original.id=candidate.advance_debt_entry_id
  JOIN debt_account advance_account ON advance_account.id=candidate.advance_debt_account_id
  JOIN debt_entry advance_settlement ON advance_settlement.id=candidate.advance_settlement_entry_id
  WHERE wage_original.id=candidate.wage_debt_entry_id
    AND wage_account.party_type='INTERNAL_WORKER' AND advance_account.party_type='INTERNAL_WORKER'
    AND wage_account.worker_id=candidate.employee_id AND advance_account.worker_id=candidate.employee_id
    AND wage_account.direction='PAYABLE' AND advance_account.direction='RECEIVABLE'
    AND wage_account.currency=candidate.currency AND advance_account.currency=candidate.currency
    AND wage_original.debt_account_id=wage_account.id AND advance_original.debt_account_id=advance_account.id
    AND wage_original.status='LIVE' AND advance_original.status='LIVE'
    AND wage_original.target_entry_id IS NULL AND wage_original.correction_of_entry_id IS NULL
    AND advance_original.target_entry_id IS NULL AND advance_original.correction_of_entry_id IS NULL
    AND wage_original.signed_amount_minor>0 AND advance_original.signed_amount_minor>0
    AND wage_original.currency=candidate.currency AND advance_original.currency=candidate.currency
    AND wage_original.producer_type=CASE candidate.wage_source_kind WHEN 'EARNING' THEN 'PAYROLL_EARNINGS' ELSE 'PAYROLL_OPENING' END
    AND wage_original.producer_id=candidate.wage_source_id
    AND candidate.wage_source_kind='EARNING'
    AND EXISTS (SELECT 1 FROM employee_earning earning WHERE earning.id=candidate.wage_source_id
      AND earning.employee_id=candidate.employee_id AND earning.currency_code=candidate.currency
      AND earning.total_minor=wage_original.signed_amount_minor)
    AND advance_original.producer_type=CASE candidate.advance_source_kind WHEN 'ADVANCE' THEN 'PAYROLL_ADVANCE' ELSE 'PAYROLL_OPENING' END
    AND advance_original.producer_id=candidate.advance_source_id
    AND candidate.advance_source_kind='ADVANCE' AND advance_original.entry_type='ADVANCE'
    AND EXISTS (SELECT 1 FROM employee_salary_advance advance JOIN employee_salary_cash cash ON cash.id=advance.cash_id
      WHERE advance.id=candidate.advance_source_id AND advance.debt_entry_id=advance_original.id
        AND advance.debt_account_id=advance_account.id AND advance.amount_minor=advance_original.signed_amount_minor
        AND cash.employee_id=candidate.employee_id AND cash.currency=candidate.currency)
    AND wage_settlement.debt_account_id=wage_account.id AND advance_settlement.debt_account_id=advance_account.id
    AND wage_settlement.target_entry_id=wage_original.id AND advance_settlement.target_entry_id=advance_original.id
    AND wage_settlement.correction_of_entry_id IS NULL AND advance_settlement.correction_of_entry_id IS NULL
    AND wage_settlement.entry_type='SETTLEMENT' AND advance_settlement.entry_type='SETTLEMENT'
    AND wage_settlement.payment_method IS NULL AND advance_settlement.payment_method IS NULL
    AND wage_settlement.status='LIVE' AND advance_settlement.status='LIVE'
    AND wage_settlement.currency=candidate.currency AND advance_settlement.currency=candidate.currency
    AND wage_settlement.producer_type=wage_original.producer_type AND wage_settlement.producer_id=wage_original.producer_id
    AND advance_settlement.producer_type=advance_original.producer_type AND advance_settlement.producer_id=advance_original.producer_id
    AND wage_settlement.signed_amount_minor=-candidate.amount_minor AND advance_settlement.signed_amount_minor=-candidate.amount_minor)`;

const crossCollection = `EXISTS (SELECT 1 FROM employee_salary_payment_allocation
    WHERE payment_entry_id IN (NEW.wage_settlement_entry_id,NEW.advance_settlement_entry_id))
  OR EXISTS (SELECT 1 FROM employee_salary_settlement
    WHERE payment_entry_id IN (NEW.wage_settlement_entry_id,NEW.advance_settlement_entry_id))`;

/** Opt-in fresh-copy preparation. No production initializer imports this DDL. */
export const payrollOffsetSchemaStatements: readonly string[] = [
  `CREATE TABLE employee_salary_advance_offset (
    id TEXT NOT NULL PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE RESTRICT,
    currency TEXT NOT NULL CHECK(currency='DZD'),
    amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 9223372036854775807),
    settlement_date TEXT NOT NULL,
    wage_source_kind TEXT NOT NULL CHECK(wage_source_kind IN ('EARNING','OPENING')), wage_source_id TEXT NOT NULL,
    advance_source_kind TEXT NOT NULL CHECK(advance_source_kind IN ('ADVANCE','OPENING_ADVANCE')), advance_source_id TEXT NOT NULL,
    wage_debt_account_id TEXT NOT NULL REFERENCES debt_account(id) ON DELETE RESTRICT,
    wage_debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id) ON DELETE RESTRICT,
    wage_settlement_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    advance_debt_account_id TEXT NOT NULL REFERENCES debt_account(id) ON DELETE RESTRICT,
    advance_debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id) ON DELETE RESTRICT,
    advance_settlement_entry_id TEXT NOT NULL UNIQUE REFERENCES debt_entry(id) ON DELETE RESTRICT,
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL,
    CHECK(wage_debt_account_id<>advance_debt_account_id), CHECK(wage_settlement_entry_id<>advance_settlement_entry_id))`,
  `CREATE TRIGGER payroll_offset_link_insert BEFORE INSERT ON employee_salary_advance_offset
    WHEN NOT ${payrollOffsetLink.replaceAll("candidate.", "NEW.")}
    BEGIN SELECT RAISE(ABORT,'Payroll offset source link mismatch'); END`,
  `CREATE TRIGGER payroll_offset_no_replace BEFORE INSERT ON employee_salary_advance_offset
    WHEN EXISTS (SELECT 1 FROM employee_salary_advance_offset WHERE id=NEW.id
      OR wage_settlement_entry_id IN (NEW.wage_settlement_entry_id,NEW.advance_settlement_entry_id)
      OR advance_settlement_entry_id IN (NEW.wage_settlement_entry_id,NEW.advance_settlement_entry_id))
    BEGIN SELECT RAISE(ABORT,'Payroll offset identity already exists'); END`,
  `CREATE TRIGGER payroll_offset_no_cash_reuse BEFORE INSERT ON employee_salary_advance_offset WHEN ${crossCollection}
    BEGIN SELECT RAISE(ABORT,'Payroll settlement already attributed to cash'); END`,
  ...["employee_salary_payment_allocation", "employee_salary_settlement"].map(table =>
    `CREATE TRIGGER ${table}_no_offset_reuse BEFORE INSERT ON ${table}
      WHEN EXISTS (SELECT 1 FROM employee_salary_advance_offset WHERE wage_settlement_entry_id=NEW.payment_entry_id OR advance_settlement_entry_id=NEW.payment_entry_id)
      BEGIN SELECT RAISE(ABORT,'Payroll settlement already attributed to an offset'); END`),
  `CREATE TRIGGER payroll_offset_immutable_update BEFORE UPDATE ON employee_salary_advance_offset
    BEGIN SELECT RAISE(ABORT,'Payroll offset provenance is immutable'); END`,
  `CREATE TRIGGER payroll_offset_immutable_delete BEFORE DELETE ON employee_salary_advance_offset
    BEGIN SELECT RAISE(ABORT,'Payroll offset provenance is immutable'); END`,
  "CREATE INDEX payroll_offset_employee ON employee_salary_advance_offset(employee_id,created_at,id)",
];
