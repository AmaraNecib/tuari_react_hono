const minor = (column: string, positive = false) => `"${column}" INTEGER NOT NULL CHECK(typeof("${column}")='integer' AND "${column}" BETWEEN ${positive ? 1 : 0} AND 9223372036854775807)`;

/** Inert fresh-copy DDL. Reference tables and the exact debt fixture compose separately. */
export const exactInvoiceSchemaStatements: readonly string[] = [
  "CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)",
  "INSERT INTO exact_money_schema VALUES ('invoice',1)",
  `CREATE TABLE invoice (
    id TEXT PRIMARY KEY, invoice_number TEXT, supplier_name TEXT NOT NULL, supplier_phone TEXT,
    counterparty_type TEXT NOT NULL CHECK(counterparty_type IN ('EXTERNAL_COUNTERPARTY','WORKER')), counterparty_id TEXT NOT NULL,
    warehouse_id TEXT, project_id TEXT, status TEXT NOT NULL CHECK(status IN ('DRAFT','RECEIVED','PAID','VOIDED')),
    direction TEXT NOT NULL CHECK(direction IN ('PURCHASE','SALE')), currency TEXT NOT NULL CHECK(currency='DZD'),
    invoice_date TEXT, due_date TEXT, notes TEXT,
    ${minor("total_amount_minor")}, ${minor("paid_amount_minor")}, ${minor("remaining_amount_minor")},
    debt_account_id TEXT REFERENCES debt_account(id), debt_entry_id TEXT REFERENCES debt_entry(id),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    CHECK(status='VOIDED' OR total_amount_minor=paid_amount_minor+remaining_amount_minor),
    CHECK(counterparty_type!='WORKER' OR direction='PURCHASE')
  )`,
  `CREATE TABLE invoice_line_item (
    id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    description TEXT NOT NULL, line_order INTEGER NOT NULL CHECK(line_order>=0), price_source TEXT NOT NULL,
    unit_price_units INTEGER CHECK(unit_price_units IS NULL OR (typeof(unit_price_units)='integer' AND unit_price_units BETWEEN 0 AND 9223372036854775807)),
    UNIQUE(invoice_id,line_order)
  )`,
  `CREATE TABLE payment (
    id TEXT PRIMARY KEY, counterparty_type TEXT NOT NULL CHECK(counterparty_type IN ('EXTERNAL_COUNTERPARTY','WORKER')), counterparty_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('PURCHASE','SALE')), currency TEXT NOT NULL CHECK(currency='DZD'),
    payment_date TEXT NOT NULL, payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH','BANK_TRANSFER','CHECK')),
    ${minor("total_amount_minor", true)}, notes TEXT, status TEXT NOT NULL CHECK(status IN ('LIVE','VOIDED')),
    actor_user_id TEXT, actor_label TEXT, transaction_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE payment_allocation (
    id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payment(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
    debt_entry_id TEXT NOT NULL REFERENCES debt_entry(id), ${minor("amount_minor", true)},
    allocation_order INTEGER NOT NULL CHECK(allocation_order>=0), status TEXT NOT NULL CHECK(status IN ('LIVE','VOIDED')), created_at TEXT NOT NULL,
    UNIQUE(payment_id,allocation_order)
  )`,
  "CREATE INDEX exact_invoice_amount_order ON invoice(total_amount_minor,id)",
  "CREATE INDEX exact_payment_amount_order ON payment(total_amount_minor,id)",
  "CREATE INDEX exact_payment_allocation_invoice ON payment_allocation(invoice_id)",
  "CREATE TRIGGER exact_invoice_owner_immutable BEFORE UPDATE ON invoice WHEN NEW.counterparty_type IS NOT OLD.counterparty_type OR NEW.counterparty_id IS NOT OLD.counterparty_id OR NEW.currency IS NOT OLD.currency OR NEW.direction IS NOT OLD.direction OR (OLD.status!='DRAFT' AND (NEW.total_amount_minor IS NOT OLD.total_amount_minor OR NEW.debt_account_id IS NOT OLD.debt_account_id OR NEW.debt_entry_id IS NOT OLD.debt_entry_id)) BEGIN SELECT RAISE(ABORT,'Invoice financial identity is immutable'); END",
  "CREATE TRIGGER exact_payment_identity_immutable BEFORE UPDATE ON payment WHEN NEW.counterparty_type IS NOT OLD.counterparty_type OR NEW.counterparty_id IS NOT OLD.counterparty_id OR NEW.currency IS NOT OLD.currency OR NEW.direction IS NOT OLD.direction OR NEW.total_amount_minor IS NOT OLD.total_amount_minor OR (OLD.status='VOIDED' AND NEW.status!='VOIDED') BEGIN SELECT RAISE(ABORT,'Payment financial identity is immutable'); END",
  "CREATE TRIGGER exact_allocation_identity_immutable BEFORE UPDATE ON payment_allocation WHEN NEW.payment_id IS NOT OLD.payment_id OR NEW.invoice_id IS NOT OLD.invoice_id OR NEW.debt_entry_id IS NOT OLD.debt_entry_id OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.allocation_order IS NOT OLD.allocation_order OR (OLD.status='VOIDED' AND NEW.status!='VOIDED') BEGIN SELECT RAISE(ABORT,'Allocation financial identity is immutable'); END",
];
