import type Database from "better-sqlite3";
import type { InvoiceRepository } from "../invoice.repository";
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceListFilters,
  InvoiceListSortField,
  SortDirection,
} from "../invoice.types";

const SORT_COLUMN_MAP: Record<InvoiceListSortField, string> = {
  createdAt: "created_at",
  invoiceDate: "invoice_date",
  totalAmountDzd: "total_amount_dzd",
};

export class SqliteInvoiceRepository implements InvoiceRepository {
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
    after?: { createdAt: string; id: string };
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

    // Count total
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM "invoice" ${whereClause}`)
      .get(...params) as { cnt: number };
    const totalCount = countRow.cnt;

    // Cursor filter
    let cursorClause = "";
    const cursorParams: unknown[] = [];
    if (query.after) {
      if (sortDir === "DESC") {
        cursorClause = `AND (created_at < ? OR (created_at = ? AND id < ?))`;
      } else {
        cursorClause = `AND (created_at > ? OR (created_at = ? AND id > ?))`;
      }
      cursorParams.push(query.after.createdAt, query.after.createdAt, query.after.id);
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
      nextCursor = Buffer.from(
        JSON.stringify({
          createdAt: lastRow.created_at as string,
          id: lastRow.id as string,
        }),
      ).toString("base64url");
    }

    return {
      items: pageRows.map((row) => this.mapRowToInvoice(row)),
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
    totalAmountDzd: number;
    paidAmountDzd: number;
    remainingAmountDzd: number;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    lineItems: {
      id: string;
      description: string;
      quantity: number;
      unitPriceDzd: number;
      totalDzd: number;
    }[];
  }): Promise<Invoice> {
    const insertInvoice = this.db.prepare(`
      INSERT INTO "invoice" (
        id, invoice_number, supplier_name, supplier_phone, warehouse_id, project_id,
        status, invoice_date, due_date, total_amount_dzd, paid_amount_dzd, remaining_amount_dzd,
        notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertLineItem = this.db.prepare(`
      INSERT INTO "invoice_line_item" (
        id, invoice_id, description, quantity, unit_price_dzd, total_dzd
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
        data.totalAmountDzd,
        data.paidAmountDzd,
        data.remainingAmountDzd,
        data.notes,
        data.createdAt,
        data.updatedAt,
      );

      for (const li of data.lineItems) {
        insertLineItem.run(li.id, data.id, li.description, li.quantity, li.unitPriceDzd, li.totalDzd);
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
      totalAmountDzd?: number;
      remainingAmountDzd?: number;
      lineItems?: {
        id: string;
        description: string;
        quantity: number;
        unitPriceDzd: number;
        totalDzd: number;
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
    if (data.totalAmountDzd !== undefined) { setClauses.push(`total_amount_dzd = ?`); params.push(data.totalAmountDzd); }
    if (data.remainingAmountDzd !== undefined) { setClauses.push(`remaining_amount_dzd = ?`); params.push(data.remainingAmountDzd); }

    if (setClauses.length > 0) {
      params.push(id);
      this.db
        .prepare(`UPDATE "invoice" SET ${setClauses.join(", ")} WHERE id = ?`)
        .run(...params);
    }

    // Replace line items if provided
    if (data.lineItems) {
      const transaction = this.db.transaction(() => {
        this.db.prepare(`DELETE FROM "invoice_line_item" WHERE invoice_id = ?`).run(id);
        const insertLineItem = this.db.prepare(`
          INSERT INTO "invoice_line_item" (id, invoice_id, description, quantity, unit_price_dzd, total_dzd)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const li of data.lineItems!) {
          insertLineItem.run(li.id, id, li.description, li.quantity, li.unitPriceDzd, li.totalDzd);
        }
      });
      transaction();
    }

    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after update`);
    return result;
  }

  async updateStatus(
    id: string,
    status: "RECEIVED" | "PAID",
    additionalUpdates?: { paidAmountDzd?: number; remainingAmountDzd?: number },
  ): Promise<Invoice> {
    const setClauses = [`status = ?`];
    const params: unknown[] = [status];

    if (additionalUpdates?.paidAmountDzd !== undefined) {
      setClauses.push(`paid_amount_dzd = ?`);
      params.push(additionalUpdates.paidAmountDzd);
    }
    if (additionalUpdates?.remainingAmountDzd !== undefined) {
      setClauses.push(`remaining_amount_dzd = ?`);
      params.push(additionalUpdates.remainingAmountDzd);
    }

    params.push(id);
    this.db
      .prepare(`UPDATE "invoice" SET ${setClauses.join(", ")} WHERE id = ?`)
      .run(...params);

    const result = await this.findById(id);
    if (!result) throw new Error(`Invoice ${id} not found after status update`);
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
      totalAmountDzd: row.total_amount_dzd as number,
      paidAmountDzd: row.paid_amount_dzd as number,
      remainingAmountDzd: row.remaining_amount_dzd as number,
      notes: row.notes as string | null,
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
      unitPriceDzd: row.unit_price_dzd as number,
      totalDzd: row.total_dzd as number,
    };
  }
}
