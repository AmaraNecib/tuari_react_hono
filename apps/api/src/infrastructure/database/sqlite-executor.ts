import type { DbExecutor } from "./schema";

/**
 * Implements DbExecutor using raw better-sqlite3(-sqlcipher).
 * This replaces Prisma for migration and schema operations.
 */
/** Raw SQL executor using better-sqlite3-sqlcipher. Replaces Prisma for migrations. */
export class BetterSqlite3Executor implements DbExecutor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any) {}

  async $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T> {
    return this.db.prepare(sql).all(...params) as T;
  }

  async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  async $transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
    const tx = new BetterSqlite3TransactionExecutor(this.db);
    try {
      const result = await work(tx);
      tx.release();
      return result;
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }
}

/**
 * Transaction executor that wraps operations in a savepoint.
 * better-sqlite3 transactions are synchronous, so we use savepoints
 * for nested transaction support.
 */
class BetterSqlite3TransactionExecutor implements DbExecutor {
  private savepointName: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any) {
    this.savepointName = `tx_${++BetterSqlite3TransactionExecutor.globalCounter}`;
    this.db.exec(`SAVEPOINT ${this.savepointName}`);
  }

  private static globalCounter = 0;

  async $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T> {
    return this.db.prepare(sql).all(...params) as T;
  }

  async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  async $transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
    const child = new BetterSqlite3TransactionExecutor(this.db);
    try {
      const result = await work(child);
      child.release();
      return result;
    } catch (error) {
      child.rollback();
      throw error;
    }
  }

  release() {
    this.db.exec(`RELEASE SAVEPOINT ${this.savepointName}`);
  }

  rollback() {
    try {
      this.db.exec(`ROLLBACK TO SAVEPOINT ${this.savepointName}`);
      this.db.exec(`RELEASE SAVEPOINT ${this.savepointName}`);
    } catch {
      // Savepoint may already be released/rolled back
    }
  }
}
