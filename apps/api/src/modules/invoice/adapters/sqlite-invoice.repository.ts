import type Database from "better-sqlite3";
import type { InvoiceRepository } from "../invoice.repository";
import type {
  Invoice,
  InvoiceCurrency,
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

export class SqliteInvoiceRepository implements InvoiceRepository {
  private transactionChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: Database.Database) {}

  async findById(id: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
    const row = this.db
      .prepare(`SELECT * FROM "invoice" WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    const lineItemRows = this.db
      .prepare(`SELECT * FROM "invoice_line_item" WHERE invoice_id = ? ORDER BY rowid`)
      .all(id) as Record<string, unknown>[];

    return {
      ...this.mapRowToInvoice(row),
      lineItems: lineItemRows.map((li) => this.mapRowToLineItem(li)),
    };
  }

  async findPaged(query: {
    filters?: InvoiceListFilters;
    sort?: { field: InvoiceListSortField; direction: SortDirection };
    after?: {
      sortValue: number | string | null;
      id: string;
      nullBoundaryPassed?: boolean;
    };
    limit: number;
  }): Promise<{ items: Invoice[]; nextCursor: string | null; totalCount: number }> {
    const sortCol = SORT_COLUMN_MAP[query.sort?.field ?? "createdAt"];
    const sortDir = query.sort?.direction === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.filters?.status) {
      conditions.push(`status = ?`);
      params.push(query.filters.status);
    }
    if (query.filters?.supplierName) {
      conditions.push(`supplier_name LIKE ?`);
      params.push(`%${query.filters.supplierName}%`);
    }
    if (query.filters?.warehouseId) {
      conditions.push(`warehouse_id = ?`);
      params.push(query.filters.warehouseId);
    }
    if (query.filters?.projectId) {
      conditions.push(`project_id = ?`);
      params.push(query.filters.projectId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM "invoice" ${whereClause}`)
      .get(...params) as { cnt: number };
    const totalCount = countRow.cnt;

    let cursorClause = "";
    const cursorParams: unknown[] = [];
    if (query.after) {
      const connector = conditions.length > 0 ? "AND" : "WHERE";
      // The cursor encodes three cases:
      //   1. nullBoundaryPassed=true: previous page ended in the null
      //      group; fetch remaining null rows (id > cursor.id) PLUS
      //      all non-null rows. Sorted ASC puts nulls first, so the
      //      natural ORDER BY (sortCol ASC, id ASC) gives the right
      //      result. The id filter only applies to the null branch
      //      (non-null rows have id > any null row by ASCII ordering
      //      of id, but we don't rely on that).
      //   2. sortValue=null: still inside the null group; continue by
      //      id only.
      //   3. sortValue=number|string: standard keyset on (sortCol, id).
      if (query.after.nullBoundaryPassed) {
        cursorClause = `${connector} ((${sortCol} IS NULL AND id > ?) OR ${sortCol} IS NOT NULL)`;
        cursorParams.push(query.after.id);
      } else if (query.after.sortValue === null) {
        if (sortDir === "DESC") {
          cursorClause = `${connector} (${sortCol} IS NULL AND id < ?)`;
        } else {
          cursorClause = `${connector} (${sortCol} IS NULL AND id > ?)`;
        }
        cursorParams.push(query.after.id);
      } else if (sortDir === "DESC") {
        cursorClause = `${connector} (${sortCol} < ? OR (${sortCol} = ? AND id < ?))`;
        cursorParams.push(
          query.after.sortValue,
          query.after.sortValue,
          query.after.id,
        );
      } else {
        cursorClause = `${connector} (${sortCol} > ? OR (${sortCol} = ? AND id > ?))`;
        cursorParams.push(
          query.after.sortValue,
          query.after.sortValue,
          query.after.id,
        );
      }
    }

    const allParams = [...params, ...cursorParams, query.limit + 1];
    const rows = this.db
      .prepare(
        `SELECT * FROM "invoice" ${whereClause} ${cursorClause} ORDER BY ${sortCol} ${sortDir}, id ${sortDir} LIMIT ?`,
      )
      .all(...allParams) as Record<string, unknown>[];

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1]!;
      const lastSortValue = lastRow[sortCol];
      // For ASC + last row has null sortValue: emit nullBoundaryPassed
      // when the cursor filter still has rows beyond the current page
      // (totalCount > pageRows.length + rows.length - query.limit).
      // The firstNonNullIdx scan of `rows` finds non-null rows in the
      // window; when totalCount > rows.length, non-null rows exist
      // beyond and we need the boundary flag to cross over.
      let firstNonNullIdx = -1;
      for (let i = query.limit; i < rows.length; i++) {
        const r = rows[i]!;
        if (r[sortCol] !== null && r[sortCol] !== undefined) {
          firstNonNullIdx = i;
          break;
        }
      }
      const moreRowsBeyond = totalCount > pageRows.length + (rows.length - query.limit);
      const isAscNullBoundary =
        sortDir === "ASC" &&
        (lastSortValue === null || lastSortValue === undefined) &&
        (firstNonNullIdx !== -1 || moreRowsBeyond);
      nextCursor = Buffer.from(
        JSON.stringify({
          sortValue: isAscNullBoundary ? null : lastSortValue,
          id: lastRow.id as string,
          ...(isAscNullBoundary ? { nullBoundaryPassed: true } : {}),
        }),
      ).toString("base64url");
    }

    const invoiceIds = pageRows.map((row) => row.id as string);
    const lineItemRows = invoiceIds.length === 0
      ? []
      : (this.db
          .prepare(
            `SELECT * FROM "invoice_line_item" WHERE invoice_id IN (${invoiceIds.map(() => "?").join(",")}) ORDER BY invoice_id, rowid`,
          )
          .all(...invoiceIds) as Record<string, unknown>[]);
    const lineItemsByInvoiceId = new Map<string, InvoiceLineItem[]>();
    for (const liRow of lineItemRows) {
      const li = this.mapRowToLineItem(liRow);
      const arr = lineItemsByInvoiceId.get(li.invoiceId) ?? [];
      arr.push(li);
      lineItemsByInvoiceId.set(li.invoiceId, arr);
    }
    const items = pageRows.map((row) => ({
      ...this.mapRowToInvoice(row),
      lineItems: lineItemsByInvoiceId.get(row.id as string) ?? [],
    }));

    return {
      items,
      nextCursor,
      totalCount,
    };
  }

  async create(data: {
    id: string;
    invoiceNumber: string | null;
    supplierName: string;
    supplierPhone: string | null;
    warehouseId: string | null;
    projectId: string | null;
    status: "DRAFT";
    invoiceDate: string | null;
    dueDate: string | null;
    currency: InvoiceCurrency;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    notes: string | null;
    debtAccountId?: string | null;
    createdAt: string;
    updatedAt: string;
    lineItems: {
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }[];
  }): Promise<Invoice> {
    const insertInvoice = this.db.prepare(`
      INSERT INTO "invoice" (
        id, invoice_number, supplier_name, supplier_phone, warehouse_id, project_id,
        status, invoice_date, due_date, currency, total_amount, paid_amount, remaining_amount,
        notes, debt_account_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLineItem = this.db.prepare(`
      INSERT INTO "invoice_line_item" (
        id, invoice_id, description, quantity, unit_price, total
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertInvoice.run(
        data.id,
        data.invoiceNumber,
        data.supplierName,
        data.supplierPhone,
        data.warehouseId,
        data.projectId,
        data.status,
        data.invoiceDate,
        data.dueDate,
        data.currency,
        data.totalAmount,
        data.paidAmount,
        data.remainingAmount,
        data.notes,
        data.debtAccountId ?? null,
        data.createdAt,
        data.updatedAt,
      );

      for (const li of data.lineItems) {
        insertLineItem.run(li.id, data.id, li.description, li.quantity, li.unitPrice, li.total);
      }
    });

    transaction();

    const created = await this.findById(data.id);
    return created!;
  }

  async update(
    id: string,
    data: {
      invoiceNumber?: string | null;
      supplierName?: string;
      supplierPhone?: string | null;
      warehouseId?: string | null;
      projectId?: string | null;
      invoiceDate?: string | null;
      dueDate?: string | null;
      notes?: string | null;
      currency?: InvoiceCurrency;
      totalAmount?: number;
      remainingAmount?: number;
      debtAccountId?: string | null;
      updatedAt?: string;
      lineItems?: {
        id: string;
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }[];
    },
  ): Promise<Invoice> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (data.invoiceNumber !== undefined) { setClauses.push(`invoice_number = ?`); params.push(data.invoiceNumber); }
    if (data.supplierName !== undefined) { setClauses.push(`supplier_name = ?`); params.push(data.supplierName); }
    if (data.supplierPhone !== undefined) { setClauses.push(`supplier_phone = ?`); params.push(data.supplierPhone); }
    if (data.warehouseId !== undefined) { setClauses.push(`warehouse_id = ?`); params.push(data.warehouseId); }
    if (data.projectId !== undefined) { setClauses.push(`project_id = ?`); params.push(data.projectId); }
    if (data.invoiceDate !== undefined) { setClauses.push(`invoice_date = ?`); params.push(data.invoiceDate); }
    if (data.dueDate !== undefined) { setClauses.push(`due_date = ?`); params.push(data.dueDate); }
    if (data.notes !== undefined) { setClauses.push(`notes = ?`); params.push(data.notes); }
    if (data.currency !== undefined) { setClauses.push(`currency = ?`); params.push(data.currency); }
    if (data.totalAmount !== undefined) { setClauses.push(`total_amount = ?`); params.push(data.totalAmount); }
    if (data.remainingAmount !== undefined) { setClauses.push(`remaining_amount = ?`); params.push(data.remainingAmount); }
    if (data.debtAccountId !== undefined) { setClauses.push(`debt_account_id = ?`); params.push(data.debtAccountId); }
    if (data.updatedAt !== undefined) { setClauses.push(`updated_at = ?`); params.push(data.updatedAt); }

    const updateInvoice = this.db.transaction(() => {
      if (setClauses.length > 0) {
        params.push(id);
        this.db
          .prepare(`UPDATE "invoice" SET ${setClauses.join(", ")} WHERE id = ?`)
          .run(...params);
      }

      if (data.lineItems) {
        this.db.prepare(`DELETE FROM "invoice_line_item" WHERE invoice_id = ?`).run(id);
        const insertLineItem = this.db.prepare(`
          INSERT INTO "invoice_line_item" (id, invoice_id, description, quantity, unit_price, total)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const li of data.lineItems!) {
          insertLineItem.run(li.id, id, li.description, li.quantity, li.unitPrice, li.total);
        }
      }
    });
    updateInvoice();

    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after update`);
    return result;
  }

  async updateStatus(
    id: string,
    status: "RECEIVED" | "PAID",
    additionalUpdates?: { paidAmount?: number; remainingAmount?: number },
  ): Promise<Invoice> {
    const setClauses = [`status = ?`];
    const params: unknown[] = [status];

    if (additionalUpdates?.paidAmount !== undefined) {
      setClauses.push(`paid_amount = ?`);
      params.push(additionalUpdates.paidAmount);
    }
    if (additionalUpdates?.remainingAmount !== undefined) {
      setClauses.push(`remaining_amount = ?`);
      params.push(additionalUpdates.remainingAmount);
    }

    setClauses.push(`updated_at = datetime('now')`);
    params.push(id);
    this.db
      .prepare(`UPDATE "invoice" SET ${setClauses.join(", ")} WHERE id = ?`)
      .run(...params);

    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after status update`);
    return result;
  }

  async markReceivedWithDebtAccount(
    id: string,
    debtAccountId: string,
  ): Promise<Invoice> {
    this.db
      .prepare(
        `UPDATE "invoice" SET status = ?, debt_account_id = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run("RECEIVED", debtAccountId, id);

    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after receive`);
    return result;
  }

  async delete(id: string): Promise<void> {
    const transaction = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM "invoice_line_item" WHERE invoice_id = ?`).run(id);
      this.db.prepare(`DELETE FROM "invoice" WHERE id = ?`).run(id);
    });
    transaction();
  }

  async count(filters?: InvoiceListFilters): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      conditions.push(`status = ?`);
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const row = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM "invoice" ${whereClause}`)
      .get(...params) as { cnt: number };

    return row.cnt;
  }

  private mapRowToInvoice(row: Record<string, unknown>): Invoice {
    return {
      id: row.id as string,
      invoiceNumber: row.invoice_number as string | null,
      supplierName: row.supplier_name as string,
      supplierPhone: row.supplier_phone as string | null,
      warehouseId: row.warehouse_id as string | null,
      projectId: row.project_id as string | null,
      status: row.status as "DRAFT" | "RECEIVED" | "PAID",
      invoiceDate: row.invoice_date as string | null,
      dueDate: row.due_date as string | null,
      currency: (row.currency as InvoiceCurrency) ?? "DZD",
      totalAmount: row.total_amount as number,
      paidAmount: row.paid_amount as number,
      remainingAmount: row.remaining_amount as number,
      notes: row.notes as string | null,
      debtAccountId: row.debt_account_id as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lineItems: [],
    };
  }

  private mapRowToLineItem(row: Record<string, unknown>): InvoiceLineItem {
    return {
      id: row.id as string,
      invoiceId: row.invoice_id as string,
      description: row.description as string,
      quantity: row.quantity as number,
      unitPrice: row.unit_price as number,
      total: row.total as number,
    };
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    // Serial mutex: better-sqlite3 has a single connection and BEGIN
    // cannot be issued while another transaction is open. Two
    // concurrent markPaid calls that both await inside `fn` would
    // otherwise collide with a "cannot start a transaction within a
    // transaction" error. Queue every transaction through a single
    // promise chain so they execute one at a time. Errors are caught
    // at the chain boundary so the next caller isn't poisoned by a
    // previous failure.
    const next = this.transactionChain.then(async () => {
      this.db.exec("BEGIN");
      try {
        const result = await fn();
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // Ignore ROLLBACK failures (e.g. connection already closed).
        }
        throw err;
      }
    });
    this.transactionChain = next.catch(() => undefined);
    return next;
  }
}
