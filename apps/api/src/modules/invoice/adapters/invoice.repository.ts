/**
 * InvoiceRepository — Drizzle-backed implementation.
 *
 * Replaces the raw-SQL InvoiceRepository. Uses Drizzle query builders
 * for type-safe reads/writes. Cursor-based pagination uses raw SQL
 * for dynamic query building (too complex for Drizzle's query builder).
 */
import { eq, and, sql } from "drizzle-orm";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import { runSyncTransaction, type FifoLock } from "../../../infrastructure/database/fifo-lock";
import * as schema from "../../../schema";
import { createDrizzleFromSqlite, type AppDrizzle } from "../../../infrastructure/database/drizzle";
import type { InvoiceRepository as IInvoiceRepository } from "../invoice.repository";
import type {
  Invoice,
  InvoiceCurrency,
  InvoiceDirection,
  InvoiceLineItem,
  InvoiceListFilters,
  InvoiceListSortField,
  SortDirection,
} from "../invoice.types";

const SORT_COLUMN_MAP: Record<InvoiceListSortField, string> = {
  createdAt: "created_at",
  invoiceDate: "invoice_date",
  totalAmount: "total_amount",
};

/** Map a raw row to Invoice. Handles both Drizzle camelCase and raw SQL snake_case. */
function mapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: String(row.id),
    invoiceNumber: (row.invoiceNumber ?? row.invoice_number) != null ? String(row.invoiceNumber ?? row.invoice_number) : null,
    supplierName: String(row.supplierName ?? row.supplier_name),
    supplierPhone: (row.supplierPhone ?? row.supplier_phone) != null ? String(row.supplierPhone ?? row.supplier_phone) : null,
    warehouseId: (row.warehouseId ?? row.warehouse_id) != null ? String(row.warehouseId ?? row.warehouse_id) : null,
    projectId: (row.projectId ?? row.project_id) != null ? String(row.projectId ?? row.project_id) : null,
    status: (row.status as Invoice["status"]) ?? "DRAFT",
    invoiceDate: (row.invoiceDate ?? row.invoice_date) != null ? String(row.invoiceDate ?? row.invoice_date) : null,
    dueDate: (row.dueDate ?? row.due_date) != null ? String(row.dueDate ?? row.due_date) : null,
    currency: ((row.currency as InvoiceCurrency) ?? "DZD") as InvoiceCurrency,
    totalAmount: Number(row.totalAmount ?? row.total_amount ?? 0),
    paidAmount: Number(row.paidAmount ?? row.paid_amount ?? 0),
    remainingAmount: Number(row.remainingAmount ?? row.remaining_amount ?? 0),
    notes: row.notes != null ? String(row.notes) : null,
    debtAccountId: (row.debtAccountId ?? row.debt_account_id) != null ? String(row.debtAccountId ?? row.debt_account_id) : null,
    direction: ((row.direction as InvoiceDirection) ?? "PURCHASE") as InvoiceDirection,
    createdAt: String(row.createdAt ?? row.created_at),
    updatedAt: String(row.updatedAt ?? row.updated_at),
    lineItems: [],
  };
}

/** Map a raw Drizzle row to InvoiceLineItem. Handles both camelCase and snake_case. */
function mapLineItem(row: Record<string, unknown>): InvoiceLineItem {
  return {
    id: String(row.id),
    invoiceId: String(row.invoiceId ?? row.invoice_id),
    description: String(row.description),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice ?? row.unit_price),
    total: Number(row.total),
  };
}

/** Drizzle-backed InvoiceRepository. */
export class InvoiceRepository implements IInvoiceRepository {
  private readonly db: AppDrizzle;
  private readonly raw: BetterSqliteDatabase;

  constructor(
    rawDb: BetterSqliteDatabase,
    /**
     * Connection-wide FIFO lock (shared with every module that opens
     * transactions on the same connection, wired in the composition root).
     * Serializes every transaction on the shared connection so no other
     * module can BEGIN while this transaction is open.
     */
    private readonly connectionLock: FifoLock,
    drizzleDb?: AppDrizzle,
  ) {
    // Support both (rawDb, lock) and (rawDb, lock, drizzleDb) callers.
    // The drizzle handle is optional: when omitted, it is created from the
    // raw connection internally.
    if (drizzleDb) {
      this.db = drizzleDb;
      this.raw = rawDb;
    } else {
      this.raw = rawDb;
      this.db = createDrizzleFromSqlite(rawDb);
    }
  }

  /**
   * Run a synchronous better-sqlite3 transaction under the connection-wide
   * lock (issue #322): execute immediately when the lock is free or owned by
   * this flow, throw when another flow holds it open — never silently join
   * an unrelated open transaction.
   */
  private guardedTransaction<T>(fn: () => T): T {
    return runSyncTransaction(this.connectionLock, (cb) => this.raw.transaction(cb)(), fn);
  }

  /** Find invoice by ID with line items. */
  async findById(id: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
    const row = this.db.select().from(schema.invoice)
      .where(eq(schema.invoice.id, id))
      .limit(1).all()[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const lineItemRows = this.db.select().from(schema.invoiceLineItem)
      .where(eq(schema.invoiceLineItem.invoiceId, id))
      .all();

    return {
      ...mapInvoice(row),
      lineItems: lineItemRows.map(mapLineItem),
    };
  }

  /** Cursor-based paginated invoice list. */
  async findPaged(query: {
    filters?: InvoiceListFilters;
    sort?: { field: InvoiceListSortField; direction: SortDirection };
    after?: { sortValue: number | string | null; id: string; nullBoundaryPassed?: boolean };
    limit: number;
  }): Promise<{ items: Invoice[]; nextCursor: string | null; totalCount: number }> {
    // Cursor pagination requires dynamic SQL — use raw queries for clarity
    const sortCol = SORT_COLUMN_MAP[query.sort?.field ?? "createdAt"];
    const sortDir = query.sort?.direction === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.filters?.status) { conditions.push("status = ?"); params.push(query.filters.status); }
    if (query.filters?.supplierName) { conditions.push("supplier_name LIKE ?"); params.push(`%${query.filters.supplierName}%`); }
    if (query.filters?.warehouseId) { conditions.push("warehouse_id = ?"); params.push(query.filters.warehouseId); }
    if (query.filters?.projectId) { conditions.push("project_id = ?"); params.push(query.filters.projectId); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = this.raw.prepare(`SELECT COUNT(*) as cnt FROM "invoice" ${whereClause}`).get(...params) as { cnt: number };
    const totalCount = countRow.cnt;

    let cursorClause = "";
    const cursorParams: unknown[] = [];
    if (query.after) {
      const connector = conditions.length > 0 ? "AND" : "WHERE";
      if (query.after.nullBoundaryPassed) {
        cursorClause = `${connector} ((${sortCol} IS NULL AND id > ?) OR ${sortCol} IS NOT NULL)`;
        cursorParams.push(query.after.id);
      } else if (query.after.sortValue === null) {
        cursorClause = `${connector} (${sortCol} IS NULL AND id ${sortDir === "DESC" ? "<" : ">"} ?)`;
        cursorParams.push(query.after.id);
      } else if (sortDir === "DESC") {
        cursorClause = `${connector} (${sortCol} < ? OR (${sortCol} = ? AND id < ?))`;
        cursorParams.push(query.after.sortValue, query.after.sortValue, query.after.id);
      } else {
        cursorClause = `${connector} (${sortCol} > ? OR (${sortCol} = ? AND id > ?))`;
        cursorParams.push(query.after.sortValue, query.after.sortValue, query.after.id);
      }
    }

    const allParams = [...params, ...cursorParams, query.limit + 1];
    const rows = this.raw.prepare(
      `SELECT * FROM "invoice" ${whereClause} ${cursorClause} ORDER BY ${sortCol} ${sortDir}, id ${sortDir} LIMIT ?`,
    ).all(...allParams) as Record<string, unknown>[];

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1]!;
      const lastSortValue = lastRow[sortCol];
      let firstNonNullIdx = -1;
      for (let i = query.limit; i < rows.length; i++) {
        const r = rows[i]!;
        if (r[sortCol] !== null && r[sortCol] !== undefined) { firstNonNullIdx = i; break; }
      }
      const moreRowsBeyond = totalCount > pageRows.length + (rows.length - query.limit);
      const isAscNullBoundary = sortDir === "ASC" && (lastSortValue === null || lastSortValue === undefined) && (firstNonNullIdx !== -1 || moreRowsBeyond);
      nextCursor = Buffer.from(JSON.stringify({
        sortValue: isAscNullBoundary ? null : lastSortValue,
        id: lastRow.id as string,
        ...(isAscNullBoundary ? { nullBoundaryPassed: true } : {}),
      })).toString("base64url");
    }

    const invoiceIds = pageRows.map((row) => row.id as string);
    const lineItemRows = invoiceIds.length === 0 ? [] : this.raw.prepare(
      `SELECT * FROM "invoice_line_item" WHERE invoice_id IN (${invoiceIds.map(() => "?").join(",")}) ORDER BY invoice_id, rowid`,
    ).all(...invoiceIds) as Record<string, unknown>[];
    const lineItemsByInvoiceId = new Map<string, InvoiceLineItem[]>();
    for (const liRow of lineItemRows) {
      const li = mapLineItem(liRow);
      const arr = lineItemsByInvoiceId.get(li.invoiceId) ?? [];
      arr.push(li);
      lineItemsByInvoiceId.set(li.invoiceId, arr);
    }
    const items = pageRows.map((row) => ({
      ...mapInvoice(row),
      lineItems: lineItemsByInvoiceId.get(row.id as string) ?? [],
    }));

    return { items, nextCursor, totalCount };
  }

  /** Create a new invoice with line items. */
  async create(data: {
    id: string; invoiceNumber: string | null; supplierName: string; supplierPhone: string | null;
    warehouseId: string | null; projectId: string | null; status: "DRAFT"; direction: InvoiceDirection;
    invoiceDate: string | null; dueDate: string | null; currency: InvoiceCurrency;
    totalAmount: number; paidAmount: number; remainingAmount: number;
    notes: string | null; debtAccountId?: string | null;
    createdAt: string; updatedAt: string;
    lineItems: { id: string; description: string; quantity: number; unitPrice: number; total: number }[];
  }): Promise<Invoice> {
    this.guardedTransaction(() => {
      this.db.insert(schema.invoice).values({
        id: data.id, invoiceNumber: data.invoiceNumber, supplierName: data.supplierName,
        supplierPhone: data.supplierPhone, warehouseId: data.warehouseId, projectId: data.projectId,
        status: data.status, direction: data.direction, invoiceDate: data.invoiceDate,
        dueDate: data.dueDate, currency: data.currency, totalAmount: data.totalAmount,
        paidAmount: data.paidAmount, remainingAmount: data.remainingAmount,
        notes: data.notes, debtAccountId: data.debtAccountId ?? null,
        createdAt: data.createdAt, updatedAt: data.updatedAt,
      }).run();
      for (const li of data.lineItems) {
        this.db.insert(schema.invoiceLineItem).values({
          id: li.id, invoiceId: data.id, description: li.description,
          quantity: li.quantity, unitPrice: li.unitPrice, total: li.total,
        }).run();
      }
    });
    const created = await this.findById(data.id);
    return created!;
  }

  /** Update an invoice and optionally replace line items. */
  async update(id: string, data: {
    invoiceNumber?: string | null; supplierName?: string; supplierPhone?: string | null;
    warehouseId?: string | null; projectId?: string | null; invoiceDate?: string | null;
    dueDate?: string | null; direction?: InvoiceDirection; notes?: string | null;
    currency?: InvoiceCurrency; totalAmount?: number; remainingAmount?: number;
    debtAccountId?: string | null; updatedAt?: string;
    lineItems?: { id: string; description: string; quantity: number; unitPrice: number; total: number }[];
  }): Promise<Invoice> {
    const updates: Record<string, unknown> = {};
    if (data.invoiceNumber !== undefined) updates.invoiceNumber = data.invoiceNumber;
    if (data.supplierName !== undefined) updates.supplierName = data.supplierName;
    if (data.supplierPhone !== undefined) updates.supplierPhone = data.supplierPhone;
    if (data.warehouseId !== undefined) updates.warehouseId = data.warehouseId;
    if (data.projectId !== undefined) updates.projectId = data.projectId;
    if (data.invoiceDate !== undefined) updates.invoiceDate = data.invoiceDate;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.totalAmount !== undefined) updates.totalAmount = data.totalAmount;
    if (data.remainingAmount !== undefined) updates.remainingAmount = data.remainingAmount;
    if (data.debtAccountId !== undefined) updates.debtAccountId = data.debtAccountId;
    if (data.direction !== undefined) updates.direction = data.direction;
    if (data.updatedAt !== undefined) updates.updatedAt = data.updatedAt;

    this.guardedTransaction(() => {
      if (Object.keys(updates).length > 0) {
        this.db.update(schema.invoice).set(updates).where(eq(schema.invoice.id, id)).run();
      }
      if (data.lineItems) {
        this.db.delete(schema.invoiceLineItem).where(eq(schema.invoiceLineItem.invoiceId, id)).run();
        for (const li of data.lineItems) {
          this.db.insert(schema.invoiceLineItem).values({
            id: li.id, invoiceId: id, description: li.description,
            quantity: li.quantity, unitPrice: li.unitPrice, total: li.total,
          }).run();
        }
      }
    });
    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after update`);
    return result;
  }

  /** Update invoice status with optional amount changes. */
  async updateStatus(id: string, status: "RECEIVED" | "PAID", additionalUpdates?: { paidAmount?: number; remainingAmount?: number }): Promise<Invoice> {
    const updates: Record<string, unknown> = { status, updatedAt: new Date().toISOString() };
    if (additionalUpdates?.paidAmount !== undefined) updates.paidAmount = additionalUpdates.paidAmount;
    if (additionalUpdates?.remainingAmount !== undefined) updates.remainingAmount = additionalUpdates.remainingAmount;
    this.db.update(schema.invoice).set(updates).where(eq(schema.invoice.id, id)).run();
    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after status update`);
    return result;
  }

  /** Mark invoice as received with debt account. */
  async markReceivedWithDebtAccount(id: string, debtAccountId: string): Promise<Invoice> {
    this.db.update(schema.invoice).set({
      status: "RECEIVED", debtAccountId, updatedAt: new Date().toISOString(),
    }).where(eq(schema.invoice.id, id)).run();
    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after receive`);
    return result;
  }

  /** Delete invoice and its line items. */
  async delete(id: string): Promise<void> {
    this.guardedTransaction(() => {
      this.db.delete(schema.invoiceLineItem).where(eq(schema.invoiceLineItem.invoiceId, id)).run();
      this.db.delete(schema.invoice).where(eq(schema.invoice.id, id)).run();
    });
  }

  /** Count invoices matching filters. */
  async count(filters?: InvoiceListFilters): Promise<number> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.status) conditions.push(eq(schema.invoice.status, filters.status));
    if (filters?.supplierName) conditions.push(sql`${schema.invoice.supplierName} LIKE ${"%" + filters.supplierName + "%"}`);
    if (filters?.warehouseId) conditions.push(eq(schema.invoice.warehouseId, filters.warehouseId));
    if (filters?.projectId) conditions.push(eq(schema.invoice.projectId, filters.projectId));
    const q = this.db.select({ value: sql<number>`count(*)` }).from(schema.invoice);
    const result = (conditions.length > 0 ? q.where(and(...conditions)) : q).all();
    return result[0]?.value ?? 0;
  }

  /** Execute a function within a serialized transaction. */
  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    // Serialize through the connection-wide lock: better-sqlite3 has a
    // single connection and BEGIN cannot be issued while another
    // transaction is open, so every transaction on the shared connection
    // queues behind the same FIFO lock (wired in the composition root).
    return this.connectionLock.run(async () => {
      // Join an externally-opened transaction instead of BEGINning a
      // second one — better-sqlite3 would throw; the outer flow owns
      // COMMIT/ROLLBACK.
      const nested = this.raw.inTransaction;
      if (!nested) {
        // BEGIN IMMEDIATE: acquire the write reservation up front so
        // validation reads inside the callback are protected.
        this.raw.exec("BEGIN IMMEDIATE");
      }
      try {
        const result = await fn();
        if (!nested) {
          this.raw.exec("COMMIT");
        }
        return result;
      } catch (err) {
        if (!nested) {
          try { this.raw.exec("ROLLBACK"); } catch { /* ignore */ }
        }
        throw err;
      }
    });
  }
}
