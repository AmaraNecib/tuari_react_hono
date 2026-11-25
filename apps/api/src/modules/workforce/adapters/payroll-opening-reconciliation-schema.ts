const nativeNonnegative = (name: string) => `${name} INTEGER NOT NULL CHECK(typeof(${name})='integer' AND ${name} BETWEEN 0 AND 9223372036854775807)`;
const nativePositive = (name: string) => `${name} INTEGER NOT NULL CHECK(typeof(${name})='integer' AND ${name} BETWEEN 1 AND 9223372036854775807)`;
const audit = "actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL";
const reason = "reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000)";

/** Pending intent and actual cash provenance. No table stores a current balance. */
export const payrollOpeningReconciliationSchemaStatements: readonly string[] = [
  `CREATE TABLE employee_opening_proposal (
    id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL REFERENCES employee_opening_source(source_id) ON DELETE RESTRICT,
    ${nativeNonnegative("old_minor")}, ${nativeNonnegative("new_minor")}, ${nativePositive("required_refund_minor")},
    ${reason}, ${audit}, CHECK(new_minor<old_minor AND required_refund_minor<=old_minor-new_minor))`,
  `CREATE TABLE employee_opening_refund (
    id TEXT PRIMARY KEY NOT NULL REFERENCES debt_entry(id) ON DELETE RESTRICT,
    proposal_id TEXT NOT NULL UNIQUE REFERENCES employee_opening_proposal(id) ON DELETE RESTRICT,
    ${nativePositive("amount_minor")}, direction TEXT NOT NULL CHECK(direction IN ('IN','OUT')),
    refund_date TEXT NOT NULL, ${audit})`,
  `CREATE TABLE employee_opening_resolution (
    id TEXT PRIMARY KEY NOT NULL, proposal_id TEXT NOT NULL UNIQUE REFERENCES employee_opening_proposal(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK(status IN ('APPLIED','CANCELLED')),
    refund_entry_id TEXT UNIQUE REFERENCES employee_opening_refund(id) ON DELETE RESTRICT,
    correction_entry_id TEXT UNIQUE REFERENCES employee_opening_correction(id) ON DELETE RESTRICT,
    ${reason}, ${audit}, CHECK((status='APPLIED' AND refund_entry_id IS NOT NULL AND correction_entry_id IS NOT NULL)
      OR (status='CANCELLED' AND refund_entry_id IS NULL AND correction_entry_id IS NULL)))`,
  `CREATE TRIGGER employee_opening_proposal_one_pending BEFORE INSERT ON employee_opening_proposal
    WHEN EXISTS(SELECT 1 FROM employee_opening_proposal p WHERE p.source_id=NEW.source_id
      AND NOT EXISTS(SELECT 1 FROM employee_opening_resolution r WHERE r.proposal_id=p.id))
    BEGIN SELECT RAISE(ABORT,'An opening proposal is already pending'); END`,
  `CREATE TRIGGER employee_opening_refund_link BEFORE INSERT ON employee_opening_refund
    WHEN NOT EXISTS(SELECT 1 FROM employee_opening_proposal p
      JOIN employee_opening_source s ON s.source_id=p.source_id JOIN debt_entry e ON e.id=NEW.id
      JOIN debt_account a ON a.id=s.debt_account_id
      WHERE p.id=NEW.proposal_id AND NOT EXISTS(SELECT 1 FROM employee_opening_resolution r WHERE r.proposal_id=p.id)
      AND a.worker_id=s.employee_id AND a.party_type='INTERNAL_WORKER'
      AND a.direction=CASE s.kind WHEN 'WAGE' THEN 'PAYABLE' ELSE 'RECEIVABLE' END AND a.currency='DZD'
      AND NEW.direction=CASE s.kind WHEN 'WAGE' THEN 'IN' ELSE 'OUT' END
      AND e.debt_account_id=a.id AND e.target_entry_id=s.debt_entry_id AND e.correction_of_entry_id IS NULL
      AND e.currency='DZD' AND e.producer_type='PAYROLL_OPENING' AND e.producer_id=s.source_id
      AND e.entry_type='ADJUSTMENT' AND e.payment_method='CASH' AND e.status='LIVE'
      AND e.signed_amount_minor=NEW.amount_minor AND NEW.amount_minor=p.required_refund_minor AND e.note=p.reason AND e.entry_date=NEW.refund_date
      AND e.actor_user_id IS NEW.actor_user_id AND e.actor_label IS NEW.actor_label
      AND e.transaction_id IS NEW.transaction_id AND e.created_at=NEW.created_at)
    BEGIN SELECT RAISE(ABORT,'Opening refund ledger mismatch'); END`,
  `CREATE TRIGGER employee_opening_resolution_link BEFORE INSERT ON employee_opening_resolution
    WHEN NEW.status='APPLIED' AND NOT EXISTS(SELECT 1 FROM employee_opening_proposal p
      JOIN employee_opening_refund f ON f.proposal_id=p.id JOIN employee_opening_correction c ON c.source_id=p.source_id
      WHERE p.id=NEW.proposal_id AND f.id=NEW.refund_entry_id AND c.id=NEW.correction_entry_id
      AND c.old_minor=p.old_minor AND c.new_minor=p.new_minor
      AND c.actor_user_id IS NEW.actor_user_id AND c.actor_label IS NEW.actor_label
      AND c.transaction_id IS NEW.transaction_id)
    BEGIN SELECT RAISE(ABORT,'Opening resolution attribution mismatch'); END`,
  ...["employee_opening_proposal", "employee_opening_refund", "employee_opening_resolution"].flatMap(table => [
    `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Opening reconciliation history is immutable'); END`,
    `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Opening reconciliation history is immutable'); END`,
    `CREATE TRIGGER ${table}_no_replace BEFORE INSERT ON ${table} WHEN EXISTS(SELECT 1 FROM ${table} WHERE id=NEW.id${table === "employee_opening_proposal" ? "" : " OR proposal_id=NEW.proposal_id"}) BEGIN SELECT RAISE(ABORT,'Opening reconciliation identity already exists'); END`,
  ]),
];
