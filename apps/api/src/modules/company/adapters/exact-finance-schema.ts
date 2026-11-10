import { schemaStatements } from "../../../infrastructure/database/schema-definitions";

/** Fresh-copy preparation only. Never passed to the production startup initializer. */
export const exactDebtSchemaStatements: readonly string[] = (() => {
  const account = schemaStatements.find(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS "debt_account"'))!;
  const entry = schemaStatements.find(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS "debt_entry"'))!;
  return [
    "CREATE TABLE IF NOT EXISTS exact_money_schema(slice TEXT PRIMARY KEY, version INTEGER NOT NULL)",
    "INSERT INTO exact_money_schema VALUES ('debt',1)",
    account.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TABLE')
      .replace('"current_balance" REAL NOT NULL DEFAULT 0', '"current_balance_minor" INTEGER NOT NULL DEFAULT 0 CHECK(typeof(current_balance_minor)=\'integer\' AND current_balance_minor BETWEEN -9223372036854775807 AND 9223372036854775807), "currency" TEXT NOT NULL CHECK(currency=\'DZD\')'),
    entry.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TABLE')
      .replace('"currency" TEXT NOT NULL DEFAULT \'DZD\'', '"currency" TEXT NOT NULL CHECK(currency=\'DZD\')')
      .replace('"signed_amount" REAL NOT NULL', '"signed_amount_minor" INTEGER NOT NULL CHECK(typeof(signed_amount_minor)=\'integer\' AND signed_amount_minor BETWEEN -9223372036854775807 AND 9223372036854775807)')
      .replace('"balance_after" REAL NOT NULL', '"balance_after_minor" INTEGER NOT NULL CHECK(typeof(balance_after_minor)=\'integer\' AND balance_after_minor BETWEEN -9223372036854775807 AND 9223372036854775807)')
      .replace('"invoice_id" TEXT,', '"invoice_id" TEXT, "posting_sequence" INTEGER NOT NULL CHECK(typeof(posting_sequence)=\'integer\' AND posting_sequence BETWEEN 1 AND 100000), "target_entry_id" TEXT REFERENCES debt_entry(id), "correction_of_entry_id" TEXT REFERENCES debt_entry(id),'),
    "CREATE UNIQUE INDEX debt_entry_posting_order ON debt_entry(debt_account_id,posting_sequence)",
    "CREATE UNIQUE INDEX debt_account_worker_direction_currency ON debt_account(worker_id,direction,currency) WHERE worker_id IS NOT NULL",
    "CREATE UNIQUE INDEX debt_account_external_direction_currency ON debt_account(external_counterparty_id,direction,currency) WHERE external_counterparty_id IS NOT NULL",
    "CREATE TABLE debt_command(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL)",
    "CREATE TRIGGER debt_account_identity_immutable BEFORE UPDATE OF party_type,worker_id,external_counterparty_id,direction,currency ON debt_account WHEN NEW.party_type IS NOT OLD.party_type OR NEW.worker_id IS NOT OLD.worker_id OR NEW.external_counterparty_id IS NOT OLD.external_counterparty_id OR NEW.direction IS NOT OLD.direction OR NEW.currency IS NOT OLD.currency BEGIN SELECT RAISE(ABORT,'Debt account identity is immutable'); END",
    "CREATE TRIGGER debt_entry_posting_immutable BEFORE UPDATE ON debt_entry WHEN NEW.debt_account_id IS NOT OLD.debt_account_id OR NEW.currency IS NOT OLD.currency OR NEW.signed_amount_minor IS NOT OLD.signed_amount_minor OR NEW.posting_sequence IS NOT OLD.posting_sequence OR NEW.target_entry_id IS NOT OLD.target_entry_id OR NEW.correction_of_entry_id IS NOT OLD.correction_of_entry_id OR NEW.entry_type IS NOT OLD.entry_type OR NEW.entry_date IS NOT OLD.entry_date OR NEW.invoice_id IS NOT OLD.invoice_id OR (OLD.status='VOIDED' AND NEW.status!='VOIDED') BEGIN SELECT RAISE(ABORT,'Debt posting is immutable'); END",
    "CREATE TRIGGER debt_entry_attribution_insert BEFORE INSERT ON debt_entry WHEN (NEW.target_entry_id IS NOT NULL AND NEW.debt_account_id IS NOT (SELECT debt_account_id FROM debt_entry WHERE id=NEW.target_entry_id)) OR (NEW.correction_of_entry_id IS NOT NULL AND NEW.debt_account_id IS NOT (SELECT debt_account_id FROM debt_entry WHERE id=NEW.correction_of_entry_id)) BEGIN SELECT RAISE(ABORT,'Debt attribution must reference the same account'); END",
    "CREATE TRIGGER debt_entry_currency_insert BEFORE INSERT ON debt_entry WHEN NEW.currency IS NOT (SELECT currency FROM debt_account WHERE id=NEW.debt_account_id) BEGIN SELECT RAISE(ABORT,'Debt entry currency mismatch'); END",
    "CREATE TRIGGER debt_entry_currency_update BEFORE UPDATE ON debt_entry WHEN NEW.currency IS NOT (SELECT currency FROM debt_account WHERE id=NEW.debt_account_id) BEGIN SELECT RAISE(ABORT,'Debt entry currency mismatch'); END",
  ];
})();
