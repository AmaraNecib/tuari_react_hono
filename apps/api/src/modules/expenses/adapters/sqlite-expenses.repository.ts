import type { BetterSqliteDatabase } from "../../../types/sqlite";
import {
  runSyncTransaction,
  type FifoLock,
} from "../../../infrastructure/database/fifo-lock";
import type { ExpenseRepository } from "../expenses.repository";
import { toUtcInstant } from "../expenses.time";
import type {
  CreateExpenseRecord,
  CreateExpenseRevisionRecord,
  Expense,
  ExpenseAudit,
  ExpenseListFilters,
  ExpenseRevision,
  UpdateExpenseRecord,
  VoidExpenseRecord,
} from "../expenses.types";

type AuditSnapshot = {
  actorUserId: string | null;
  actorLabel: string | null;
  transactionId: string | null;
};

function normalizeAudit(audit?: ExpenseAudit): AuditSnapshot {
  return {
    actorUserId: audit?.actorUserId ?? null,
    actorLabel: audit?.actorLabel ?? null,
    transactionId: audit?.transactionId ?? null,
  };
}

/**
 * SQLite expenses repository.
 *
 * Every write is either a single statement or runs inside `runInTransaction`,
 * which serializes on the shared connection-wide FIFO lock with a
 * `BEGIN IMMEDIATE` write reservation (same discipline as the payment and
 * company repositories).
 */
export interface ExpenseStorageCodec<Amount> {
  amountColumn: "amount_dzd" | "amount_minor";
  previousColumn: "previous_amount_dzd" | "previous_amount_minor";
  newColumn: "new_amount_dzd" | "new_amount_minor";
  expenseProjection: string;
  revisionProjection: string;
  encode(value: Amount): unknown;
  decode(value: unknown): Amount;
  validateExpense?(row: Record<string, unknown>): void;
  validateRevision?(row: Record<string, unknown>): void;
  currency?: "DZD";
}

const numericStorage: ExpenseStorageCodec<number> = {
  amountColumn: "amount_dzd",
  previousColumn: "previous_amount_dzd",
  newColumn: "new_amount_dzd",
  expenseProjection: "*",
  revisionProjection: "*",
  encode: (value) => value,
  decode: (value) => value as number,
};

export class SqliteExpenseStorage<Amount> implements ExpenseRepository<Amount> {
  constructor(
    private readonly db: BetterSqliteDatabase,
    private readonly connectionLock: FifoLock,
    private readonly codec: ExpenseStorageCodec<Amount>,
  ) {}

  async create(data: CreateExpenseRecord<Amount>, audit?: ExpenseAudit): Promise<Expense<Amount>> {
    const snapshot = normalizeAudit(audit);
    // Single-statement writes still run under the connection-wide lock: a raw
    // `.run()` while another flow holds an open transaction would be absorbed
    // into it as a SAVEPOINT and silently rolled back when that flow fails.
    runSyncTransaction(this.connectionLock, this.db, () => {
      this.db
        .prepare(
          `INSERT INTO "expense" (
            id, ${this.codec.amountColumn}, expense_date, what_for, responsible_worker_id,
            seller_id, project_id, stock_item_id, note, status,
            voided_at, voided_by, void_reason,
            actor_user_id, actor_label, transaction_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'LIVE', NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.id,
          this.codec.encode(data.amount),
          toUtcInstant(data.expenseDate),
          data.whatFor,
          data.responsibleWorkerId,
          data.sellerId,
          data.projectId,
          data.stockItemId,
          data.note,
          snapshot.actorUserId,
          snapshot.actorLabel,
          snapshot.transactionId,
          data.createdAt,
          data.updatedAt,
        );
    });

    return (await this.findById(data.id))!;
  }

  async findById(id: string): Promise<Expense<Amount> | null> {
    const row = this.db
      .prepare(`SELECT ${this.codec.expenseProjection} FROM "expense" WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapRowToExpense(row, this.codec) : null;
  }

  async list(filters: ExpenseListFilters): Promise<Expense<Amount>[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.projectId !== undefined) {
      conditions.push(`project_id = ?`);
      params.push(filters.projectId);
    }
    if (filters.responsibleWorkerId !== undefined) {
      conditions.push(`responsible_worker_id = ?`);
      params.push(filters.responsibleWorkerId);
    }
    if (filters.fromDate !== undefined) {
      conditions.push(`expense_date >= ?`);
      params.push(toUtcInstant(filters.fromDate));
    }
    if (filters.toDate !== undefined) {
      conditions.push(`expense_date <= ?`);
      params.push(toUtcInstant(filters.toDate));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT ${this.codec.expenseProjection} FROM "expense" ${where} ORDER BY expense_date DESC, created_at DESC, id DESC`,
      )
      .all(...params) as Record<string, unknown>[];

    return rows.map((row) => mapRowToExpense(row, this.codec));
  }

  async update(data: UpdateExpenseRecord<Amount>, audit?: ExpenseAudit): Promise<Expense<Amount> | null> {
    const snapshot = normalizeAudit(audit);
    let changes = 0;
    runSyncTransaction(this.connectionLock, this.db, () => {
      const result = this.db
        .prepare(
          `UPDATE "expense" SET
            ${this.codec.amountColumn} = ?, expense_date = ?, what_for = ?, responsible_worker_id = ?,
            seller_id = ?, project_id = ?, stock_item_id = ?, note = ?,
            actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ?
          WHERE id = ? AND status = 'LIVE'`,
        )
        .run(
          this.codec.encode(data.amount),
          toUtcInstant(data.expenseDate),
          data.whatFor,
          data.responsibleWorkerId,
          data.sellerId,
          data.projectId,
          data.stockItemId,
          data.note,
          snapshot.actorUserId,
          snapshot.actorLabel,
          snapshot.transactionId,
          data.updatedAt,
          data.id,
        );
      changes = result.changes;
    });

    if (changes === 0) return null;
    return this.findById(data.id);
  }

  async voidExpense(data: VoidExpenseRecord, audit?: ExpenseAudit): Promise<Expense<Amount> | null> {
    const snapshot = normalizeAudit(audit);
    let changes = 0;
    runSyncTransaction(this.connectionLock, this.db, () => {
      const result = this.db
        .prepare(
          `UPDATE "expense" SET
            status = 'VOIDED', voided_at = ?, void_reason = ?, voided_by = ?,
            actor_user_id = ?, actor_label = ?, transaction_id = ?, updated_at = ?
          WHERE id = ? AND status = 'LIVE'`,
        )
        .run(
          data.voidedAt,
          data.voidReason,
          snapshot.actorLabel,
          snapshot.actorUserId,
          snapshot.actorLabel,
          snapshot.transactionId,
          data.updatedAt,
          data.id,
        );
      changes = result.changes;
    });

    if (changes === 0) return null;
    return this.findById(data.id);
  }

  async createRevision(
    data: CreateExpenseRevisionRecord<Amount>,
    audit?: ExpenseAudit,
  ): Promise<ExpenseRevision<Amount>> {
    const snapshot = normalizeAudit(audit);
    runSyncTransaction(this.connectionLock, this.db, () => {
      this.db
        .prepare(
          `INSERT INTO "expense_revision" (
            id, expense_id, ${this.codec.previousColumn}, ${this.codec.newColumn}, changed_fields,
            reason, actor_user_id, actor_label, transaction_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.id,
          data.expenseId,
          data.previousAmount === null ? null : this.codec.encode(data.previousAmount),
          this.codec.encode(data.newAmount),
          JSON.stringify(data.changedFields),
          data.reason,
          snapshot.actorUserId,
          snapshot.actorLabel,
          snapshot.transactionId,
          data.createdAt,
        );
    });

    return {
      id: data.id,
      expenseId: data.expenseId,
      previousAmount: data.previousAmount,
      newAmount: data.newAmount,
      changedFields: data.changedFields,
      reason: data.reason,
      actorUserId: snapshot.actorUserId,
      actorLabel: snapshot.actorLabel,
      transactionId: snapshot.transactionId,
      createdAt: data.createdAt,
    };
  }

  async listRevisionsByExpenseId(expenseId: string): Promise<ExpenseRevision<Amount>[]> {
    const rows = this.db
      .prepare(
        `SELECT ${this.codec.revisionProjection} FROM "expense_revision" WHERE expense_id = ? ORDER BY created_at ASC, id ASC`,
      )
      .all(expenseId) as Record<string, unknown>[];

    return rows.map((row) => mapRowToRevision(row, this.codec));
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.connectionLock.run(async () => {
      const nested = this.db.inTransaction;
      if (!nested) {
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

function mapRowToExpense<Amount>(row: Record<string, unknown>, codec: ExpenseStorageCodec<Amount>): Expense<Amount> {
  codec.validateExpense?.(row);
  return {
    id: row.id as string,
    ...(codec.currency ? { currency: codec.currency } : {}),
    amount: codec.decode(row.amount_dzd),
    expenseDate: row.expense_date as string,
    whatFor: row.what_for as string | null,
    responsibleWorkerId: row.responsible_worker_id as string | null,
    sellerId: row.seller_id as string | null,
    projectId: row.project_id as string | null,
    stockItemId: row.stock_item_id as string | null,
    note: row.note as string | null,
    status: row.status as Expense<Amount>["status"],
    voidedAt: row.voided_at as string | null,
    voidedBy: row.voided_by as string | null,
    voidReason: row.void_reason as string | null,
    actorUserId: row.actor_user_id as string | null,
    actorLabel: row.actor_label as string | null,
    transactionId: row.transaction_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapRowToRevision<Amount>(row: Record<string, unknown>, codec: ExpenseStorageCodec<Amount>): ExpenseRevision<Amount> {
  codec.validateRevision?.(row);
  return {
    id: row.id as string,
    expenseId: row.expense_id as string,
    previousAmount: row.previous_amount_dzd === null ? null : codec.decode(row.previous_amount_dzd),
    newAmount: codec.decode(row.new_amount_dzd),
    changedFields: parseChangedFields(row.changed_fields),
    reason: row.reason as string | null,
    actorUserId: row.actor_user_id as string | null,
    actorLabel: row.actor_label as string | null,
    transactionId: row.transaction_id as string | null,
    createdAt: row.created_at as string,
  };
}

export class SqliteExpenseRepository extends SqliteExpenseStorage<number> {
  constructor(db: BetterSqliteDatabase, connectionLock: FifoLock) {
    super(db, connectionLock, numericStorage);
  }
}

function parseChangedFields(value: unknown): ExpenseRevision["changedFields"] {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ExpenseRevision["changedFields"]) : [];
  } catch {
    return [];
  }
}
