import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import type { PaymentRepository } from "../payment.repository";
import type {
  Payment,
  PaymentAllocation,
  PaymentWithAllocations,
  PaymentListFilters,
  PaymentListSortField,
  SortDirection,
  PaymentDeleteResult,
} from "../payment.types";

const SORT_COLUMN_MAP: Record<PaymentListSortField, string> = {
  paymentDate: "payment_date",
  totalAmount: "total_amount",
  createdAt: "created_at",
};

/**
 * SQLite payment repository.
 *
 * Transaction discipline: every WRITE path is serialized through the
 * connection-wide lock — `runInTransaction` (the whole validate → create →
 * allocate flow) and `deleteIfUnallocated` (its sync transaction). The
 * unlocked read methods (`findById`, `findPaged`, `findAllocationsByPaymentId`)
 * and `createPayment`/`createAllocation` are join surface: they execute on the
 * connection as-is, so they must only be called (a) outside any transaction,
 * or (b) from inside a `runInTransaction` callback where they join the open
 * transaction. Never call them from an unrelated module's open transaction.
 */
export class PaymentRepositoryImpl implements PaymentRepository {
  constructor(
    private readonly db: BetterSqliteDatabase,
    /**
     * Connection-wide FIFO lock (shared with every module that opens
     * transactions on the same connection, wired in the composition root).
     * Serializes every transaction on the shared connection so no other
     * module can BEGIN while this transaction is open.
     */
    private readonly connectionLock: FifoLock,
  ) {}

  async findById(id: string): Promise<PaymentWithAllocations | null> {
    const row = this.db
      .prepare(`SELECT * FROM "payment" WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    const allocRows = this.db
      .prepare(`SELECT * FROM "payment_allocation" WHERE payment_id = ? ORDER BY created_at`)
      .all(id) as Record<string, unknown>[];

    return {
      ...this.mapRowToPayment(row),
      allocations: allocRows.map((r) => this.mapRowToAllocation(r)),
    };
  }

  async findPaged(query: {
    filters?: PaymentListFilters;
    sort?: { field: PaymentListSortField; direction: SortDirection };
    after?: { sortValue: number | string | null; id: string };
    limit: number;
  }): Promise<{ items: Payment[]; nextCursor: string | null; totalCount: number }> {
    const sortCol = SORT_COLUMN_MAP[query.sort?.field ?? "createdAt"];
    const sortDir = query.sort?.direction === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.filters?.counterpartyType) {
      conditions.push(`counterparty_type = ?`);
      params.push(query.filters.counterpartyType);
    }
    if (query.filters?.counterpartyId) {
      conditions.push(`counterparty_id = ?`);
      params.push(query.filters.counterpartyId);
    }
    if (query.filters?.paymentMethod) {
      conditions.push(`payment_method = ?`);
      params.push(query.filters.paymentMethod);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM "payment" ${whereClause}`)
      .get(...params) as { cnt: number };
    const totalCount = countRow.cnt;

    let cursorClause = "";
    const cursorParams: unknown[] = [];
    if (query.after) {
      const connector = conditions.length > 0 ? "AND" : "WHERE";
      if (query.after.sortValue === null) {
        if (sortDir === "DESC") {
          cursorClause = `${connector} (${sortCol} IS NULL AND id < ?)`;
        } else {
          cursorClause = `${connector} (${sortCol} IS NULL AND id > ?)`;
        }
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
    const rows = this.db
      .prepare(
        `SELECT * FROM "payment" ${whereClause} ${cursorClause} ORDER BY ${sortCol} ${sortDir}, id ${sortDir} LIMIT ?`,
      )
      .all(...allParams) as Record<string, unknown>[];

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1]!;
      nextCursor = Buffer.from(
        JSON.stringify({ sortValue: lastRow[sortCol], id: lastRow.id as string }),
      ).toString("base64url");
    }

    const items = pageRows.map((row) => this.mapRowToPayment(row));

    return { items, nextCursor, totalCount };
  }

  async createPayment(data: {
    id: string;
    counterpartyType: string;
    counterpartyId: string;
    paymentDate: string;
    paymentMethod: string;
    totalAmount: number;
    notes: string | null;
    actorUserId: string | null;
    actorLabel: string | null;
    transactionId: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<Payment> {
    this.db
      .prepare(
        `INSERT INTO "payment" (id, counterparty_type, counterparty_id, payment_date, payment_method, total_amount, notes, actor_user_id, actor_label, transaction_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.counterpartyType,
        data.counterpartyId,
        data.paymentDate,
        data.paymentMethod,
        data.totalAmount,
        data.notes,
        data.actorUserId,
        data.actorLabel,
        data.transactionId,
        data.createdAt,
        data.updatedAt,
      );

    const result = await this.findById(data.id);
    return result!;
  }

  async createAllocation(data: {
    id: string;
    paymentId: string;
    invoiceId: string;
    amount: number;
    createdAt: string;
  }): Promise<PaymentAllocation> {
    this.db
      .prepare(
        `INSERT INTO "payment_allocation" (id, payment_id, invoice_id, amount, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(data.id, data.paymentId, data.invoiceId, data.amount, data.createdAt);

    return {
      id: data.id,
      paymentId: data.paymentId,
      invoiceId: data.invoiceId,
      amount: data.amount,
      createdAt: data.createdAt,
    };
  }

  async deleteIfUnallocated(id: string): Promise<PaymentDeleteResult> {
    // Sync transaction (better-sqlite3) — must not BEGIN while another
    // module holds an open transaction on the shared connection, so it
    // runs under the connection-wide lock too. The existence + allocation
    // guard lives INSIDE the transaction, so the check and the delete are
    // one critical section: a concurrent create for the same payment id
    // (itself serialized on the same lock) either lands entirely before
    // (→ HAS_ALLOCATIONS, nothing deleted) or entirely after (→ DELETED,
    // then the create re-inserts a fresh payment). The issue-#289 TOCTOU
    // window is closed by construction.
    return this.connectionLock.run(async () => {
      const transaction = this.db.transaction((): PaymentDeleteResult => {
        const exists = this.db.prepare(`SELECT 1 FROM "payment" WHERE id = ?`).get(id);
        if (!exists) {
          return { status: "NOT_FOUND" };
        }
        const { c: allocationCount } = this.db
          .prepare(`SELECT COUNT(*) AS c FROM "payment_allocation" WHERE payment_id = ?`)
          .get(id) as { c: number };
        if (allocationCount > 0) {
          return { status: "HAS_ALLOCATIONS", count: allocationCount };
        }
        this.db.prepare(`DELETE FROM "payment" WHERE id = ?`).run(id);
        return { status: "DELETED" };
      });
      return transaction();
    });
  }

  async findAllocationsByPaymentId(paymentId: string): Promise<PaymentAllocation[]> {
    const rows = this.db
      .prepare(`SELECT * FROM "payment_allocation" WHERE payment_id = ? ORDER BY created_at`)
      .all(paymentId) as Record<string, unknown>[];

    return rows.map((r) => this.mapRowToAllocation(r));
  }

  private mapRowToPayment(row: Record<string, unknown>): Payment {
    return {
      id: row.id as string,
      counterpartyType: row.counterparty_type as Payment["counterpartyType"],
      counterpartyId: row.counterparty_id as string,
      paymentDate: row.payment_date as string,
      paymentMethod: row.payment_method as Payment["paymentMethod"],
      totalAmount: row.total_amount as number,
      notes: row.notes as string | null,
      actorUserId: row.actor_user_id as string | null,
      actorLabel: row.actor_label as string | null,
      transactionId: row.transaction_id as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapRowToAllocation(row: Record<string, unknown>): PaymentAllocation {
    return {
      id: row.id as string,
      paymentId: row.payment_id as string,
      invoiceId: row.invoice_id as string,
      amount: row.amount as number,
      createdAt: row.created_at as string,
    };
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.connectionLock.run(async () => {
      // If a transaction was already opened OUTSIDE the repository (e.g. a
      // bootstrap flow on the shared connection), join it instead of
      // BEGINning a second one — better-sqlite3 would throw. The caller
      // participates in that outer transaction (its COMMIT/ROLLBACK wins).
      const nested = this.db.inTransaction;
      if (!nested) {
        // BEGIN IMMEDIATE: acquire the SQLite write reservation up front. On
        // the single in-process connection the FIFO lock already serializes
        // transactions; this protects the capacity-validation reads when a
        // SECOND process touches the same database file (write lock held from
        // BEGIN, so no stale remaining_amount can be read before the write).
        this.db.exec("BEGIN IMMEDIATE");
      }
      try {
        const result = await fn();
        if (!nested) {
          this.db.exec("COMMIT");
        }
        return result;
      } catch (err) {
        if (!nested) {
          try {
            this.db.exec("ROLLBACK");
          } catch {
            // Ignore ROLLBACK failures (e.g. connection already closed).
          }
        }
        throw err;
      }
    });
  }
}
