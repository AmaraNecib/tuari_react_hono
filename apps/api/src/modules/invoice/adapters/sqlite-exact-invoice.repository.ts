import { Money, UnitPrice, exactInvoiceSchema, exactPaymentSchema, parseExactLine, sumMoney, type ExactInvoice, type ExactPayment } from "@tuari/contracts";
import { bindMoney, bindUnitPrice, prepareMoneyRead, prepareUnitPriceRead } from "../../../infrastructure/database/exact-money-storage";
import { requireExactMoneySchema } from "../../../infrastructure/database/money-schema-gate";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { ExactInvoiceRepository } from "../invoice-exact.repository";

const invoiceFields = { id: "id", invoiceNumber: "invoice_number", supplierName: "supplier_name", supplierPhone: "supplier_phone", counterpartyType: "counterparty_type", counterpartyId: "counterparty_id", warehouseId: "warehouse_id", projectId: "project_id", status: "status", direction: "direction", currency: "currency", invoiceDate: "invoice_date", dueDate: "due_date", notes: "notes", debtAccountId: "debt_account_id", debtEntryId: "debt_entry_id", createdAt: "created_at", updatedAt: "updated_at" } as const;
const paymentFields = { id: "id", counterpartyType: "counterparty_type", counterpartyId: "counterparty_id", direction: "direction", currency: "currency", paymentDate: "payment_date", paymentMethod: "payment_method", notes: "notes", status: "status", actorUserId: "actor_user_id", actorLabel: "actor_label", transactionId: "transaction_id", createdAt: "created_at", updatedAt: "updated_at" } as const;
const allocationFields = { id: "id", paymentId: "payment_id", invoiceId: "invoice_id", debtEntryId: "debt_entry_id", status: "status", createdAt: "created_at" } as const;
const projection = (fields: Record<string, string>) => Object.entries(fields).map(([key, column]) => `"${column}" AS "${key}"`).join(",");

/** Never selected by the active numeric dependency composition. */
export class SqliteExactInvoiceRepository implements ExactInvoiceRepository {
  constructor(private readonly db: BetterSqliteDatabase, private readonly lock: FifoLock) {
    requireExactMoneySchema(db, "invoice");
    for (const [table, required, forbidden] of [
      ["invoice", { ...Object.fromEntries(Object.values(invoiceFields).map(name => [name, "TEXT"])), total_amount_minor: "INTEGER", paid_amount_minor: "INTEGER", remaining_amount_minor: "INTEGER" }, ["total_amount", "paid_amount", "remaining_amount"]],
      ["invoice_line_item", { id: "TEXT", invoice_id: "TEXT", description: "TEXT", line_order: "INTEGER", price_source: "TEXT", unit_price_units: "INTEGER" }, ["quantity", "unit_price", "total"]],
      ["payment", { ...Object.fromEntries(Object.values(paymentFields).map(name => [name, "TEXT"])), total_amount_minor: "INTEGER" }, ["total_amount", "amount_dzd"]],
      ["payment_allocation", { ...Object.fromEntries(Object.values(allocationFields).map(name => [name, "TEXT"])), amount_minor: "INTEGER", allocation_order: "INTEGER" }, ["amount", "amount_dzd"]],
    ] as const) {
      const columns = db.pragma(`table_info(${table})`) as { name: string; type: string }[];
      for (const [name, type] of Object.entries(required)) if (columns.find(column => column.name === name)?.type.toUpperCase() !== type) throw new TypeError(`Invalid exact invoice column ${table}.${name}`);
      if (columns.some(column => (forbidden as readonly string[]).includes(column.name))) throw new TypeError("Legacy invoice money columns cannot coexist with exact storage");
    }
  }
  get transactionIdentity() { return { connection: this.db, lock: this.lock }; }
  withTransaction<T>(work: () => T): T { return this.lock.runSync(() => this.db.transaction(work).immediate()); }
  private amount(table: string, column: string, id: string): string {
    const value = prepareMoneyRead(this.db, `SELECT "${column}" AS minor_units FROM "${table}" WHERE id=?`).get(id);
    if (!value) throw new Error("Missing exact invoice amount");
    return value.toWire();
  }
  getInvoice(id: string): ExactInvoice | null {
    return this.withTransaction(() => {
      const metadata = this.db.prepare(`SELECT ${projection(invoiceFields)} FROM invoice WHERE id=?`).get(id) as Record<string, unknown> | undefined;
      if (!metadata) return null;
      const lineItems = (this.db.prepare("SELECT id,invoice_id AS invoiceId,description,price_source AS source FROM invoice_line_item WHERE invoice_id=? ORDER BY line_order").all(id) as { id: string; invoiceId: string; description: string; source: string }[]).map(row => {
        const source = parseExactLine(JSON.parse(row.source)).toJSON();
        const storedPrice = prepareUnitPriceRead(this.db, "SELECT unit_price_units AS scaled_units FROM invoice_line_item WHERE id=?").get(row.id);
        if ((source.mode === "unit-price" ? source.price : null) !== (storedPrice?.toWire() ?? null)) throw new Error("Invoice line source and entered price disagree");
        return { ...row, source };
      });
      return exactInvoiceSchema.parse({ ...metadata, totalAmount: this.amount("invoice", "total_amount_minor", id), paidAmount: this.amount("invoice", "paid_amount_minor", id), remainingAmount: this.amount("invoice", "remaining_amount_minor", id), lineItems });
    });
  }
  private ids(table: "invoice" | "payment"): string[] {
    const rows = this.db.prepare(`SELECT id FROM "${table}" ORDER BY id LIMIT 100001`).all() as { id: string }[];
    if (rows.length > 100000) throw new RangeError("Exact financial read resource limit exceeded");
    return rows.map(row => row.id);
  }
  listInvoices(): ExactInvoice[] {
    return this.withTransaction(() => this.ids("invoice").map(id => this.getInvoice(id)!));
  }
  saveInvoice(raw: ExactInvoice): void {
    const invoice = exactInvoiceSchema.parse(raw);
    this.withTransaction(() => {
      this.upsert("invoice", { ...this.metadata(invoice, invoiceFields), total_amount_minor: bindMoney(Money.parse(invoice.totalAmount)), paid_amount_minor: bindMoney(Money.parse(invoice.paidAmount)), remaining_amount_minor: bindMoney(Money.parse(invoice.remainingAmount)) });
      this.db.prepare("DELETE FROM invoice_line_item WHERE invoice_id=?").run(invoice.id);
      for (const [index, line] of invoice.lineItems.entries()) this.upsert("invoice_line_item", { id: line.id, invoice_id: invoice.id, description: line.description, line_order: index, price_source: JSON.stringify(line.source), unit_price_units: line.source.mode === "unit-price" ? bindUnitPrice(UnitPrice.parse(line.source.price)) : null });
    });
  }
  deleteInvoice(id: string): void { this.withTransaction(() => { this.db.prepare("DELETE FROM invoice WHERE id=?").run(id); }); }
  getPayment(id: string): ExactPayment | null {
    return this.withTransaction(() => {
      const metadata = this.db.prepare(`SELECT ${projection(paymentFields)} FROM payment WHERE id=?`).get(id) as Record<string, unknown> | undefined;
      if (!metadata) return null;
      const allocations = (this.db.prepare(`SELECT ${projection(allocationFields)} FROM payment_allocation WHERE payment_id=? ORDER BY allocation_order`).all(id) as Omit<ExactPayment["allocations"][number], "amount">[]).map(row => ({ ...row, amount: this.amount("payment_allocation", "amount_minor", row.id) }));
      const totalAmount = this.amount("payment", "total_amount_minor", id);
      const allocated = Money.parse(sumMoney(allocations.filter(row => row.status === "LIVE").map(row => Money.parse(row.amount))));
      return exactPaymentSchema.parse({ ...metadata, totalAmount, unallocatedAmount: Money.parse(totalAmount).subtract(allocated).toWire(), allocations });
    });
  }
  listPayments(): ExactPayment[] {
    return this.withTransaction(() => this.ids("payment").map(id => this.getPayment(id)!));
  }
  savePayment(raw: ExactPayment): void {
    const payment = exactPaymentSchema.parse(raw);
    this.withTransaction(() => {
      const live = Money.parse(sumMoney(payment.allocations.filter(row => row.status === "LIVE").map(row => Money.parse(row.amount))));
      if (Money.parse(payment.totalAmount).subtract(live).toWire() !== payment.unallocatedAmount) throw new Error("Payment allocations do not reconcile");
      this.upsert("payment", { ...this.metadata(payment, paymentFields), total_amount_minor: bindMoney(Money.parse(payment.totalAmount)) });
      for (const [index, row] of payment.allocations.entries()) this.upsert("payment_allocation", { ...this.metadata(row, allocationFields), amount_minor: bindMoney(Money.parse(row.amount)), allocation_order: index });
    });
  }
  deletePayment(id: string): void { this.withTransaction(() => { this.db.prepare("DELETE FROM payment WHERE id=?").run(id); }); }
  private metadata<T extends object>(row: T, fields: Partial<Record<keyof T, string>>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fields).map(([key, column]) => [column, row[key as keyof T]]));
  }
  private upsert(table: string, values: Record<string, unknown>): void {
    const columns = Object.keys(values);
    this.db.prepare(`INSERT INTO "${table}" (${columns.map(name => `"${name}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(name => name !== "id").map(name => `"${name}"=excluded."${name}"`).join(",")}`).run(...Object.values(values));
  }
}
