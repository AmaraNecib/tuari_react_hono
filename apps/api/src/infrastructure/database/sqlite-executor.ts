import Database from "better-sqlite3"
import type { DbExecutor } from "./schema"

/**
 * Implements DbExecutor using raw better-sqlite3.
 * .
 */
export class BetterSqlite3Executor implements DbExecutor {
  constructor(private readonly db: Database.Database) {}

  /** Execute a SQL query and return all matching rows. */
  async $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T> {
    return this.db.prepare(sql).all(...params) as T;
  }

  /** Execute a SQL statement and return the number of affected rows. */
  async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  /** Run work inside a savepoint transaction with auto-commit/rollback. */
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

  constructor(private readonly db: Database.Database) {
    this.savepointName = `tx_${++BetterSqlite3TransactionExecutor.globalCounter}`;
    this.db.exec(`SAVEPOINT ${this.savepointName}`);
  }

  private static globalCounter = 0;

  /** Execute a SQL query inside this savepoint. */
  async $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T> {
    return this.db.prepare(sql).all(...params) as T;
  }

  /** Execute a SQL statement inside this savepoint. */
  async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  /** Run nested work inside a child savepoint. */
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
