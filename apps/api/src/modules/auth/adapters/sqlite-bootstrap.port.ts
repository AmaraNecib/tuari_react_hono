import { randomUUID } from "node:crypto";

import { eq, count, sql } from "drizzle-orm";

import type { AppDrizzle } from "../../../infrastructure/database/drizzle";
import type { FifoLock } from "../../../infrastructure/database/fifo-lock";
import { user, account, appBootstrapState } from "../../../schema";
import type { BetterSqliteDatabase } from "../../../types/sqlite";
import type {
  BootstrapPort,
  CreateFirstUserInput,
  CreateFirstUserResult,
} from "../bootstrap.types";

/** Check if an error is a SQLite UNIQUE constraint violation. */
function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

/**
 * SQLite implementation of {@link BootstrapPort}.
 *
 * Owns every Drizzle/SQLite detail of the bootstrap flow:
 *   - the raw-SQLite write transaction (Drizzle's `db.transaction()` does not
 *     support async callbacks with better-sqlite3, so we use `BEGIN IMMEDIATE`
 *     to acquire the write lock before the conflict check),
 *   - the conflict / uniqueness-race mapping to `{ status: "conflict" }`,
 *   - the user / account / bootstrap-state inserts.
 *
 * Transaction notes:
 *   - Atomicity relies on `db` and `raw` sharing ONE connection: the
 *     `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` statements run on `raw` while the
 *     inserts run on `db`. Drizzle's better-sqlite3 driver is synchronous
 *     under the hood, and the whole flow runs under the injected
 *     connection-wide FIFO lock, so the `await`s below never yield to
 *     another writer on the shared connection; a genuinely async operation
 *     inside the transaction would break that guarantee. The constructor
 *     fails fast when the two handles are not the same connection, because
 *     a mismatched pair would silently break atomicity.
 *   - A concurrent bootstrap in another process contends on the SQLite write
 *     lock and surfaces as `SQLITE_BUSY` at `BEGIN IMMEDIATE`; that error
 *     propagates (deliberately, matching prior behavior) rather than being
 *     mapped to `conflict`, which only covers same-connection races.
 */
export class SqliteBootstrapPort implements BootstrapPort {
  constructor(
    private readonly db: AppDrizzle,
    private readonly raw: BetterSqliteDatabase,
    /**
     * Connection-wide FIFO lock (shared with every module that opens
     * transactions on the same connection, wired in the composition root).
     * createFirstUser holds it for the whole transaction so no other module
     * can BEGIN on the shared connection while the bootstrap write is open.
     */
    private readonly connectionLock: FifoLock,
  ) {
    if (db.$client !== raw) {
      throw new Error(
        "SqliteBootstrapPort requires the Drizzle handle and the raw SQLite handle to share one connection.",
      );
    }
  }

  async createFirstUser(input: CreateFirstUserInput): Promise<CreateFirstUserResult> {
    return this.connectionLock.run(async () => {
      // Join an already-open outer transaction (same pattern as the other
      // ports) instead of BEGINning a second one — better-sqlite3 would
      // throw. The caller participates in that outer transaction (its
      // COMMIT/ROLLBACK wins), so the conflict path must not COMMIT either.
      const nested = this.raw.inTransaction;
      if (!nested) {
        this.raw.exec("BEGIN IMMEDIATE");
      }
      try {
        if (await this.hasConfiguredUsers()) {
          // Conflict is not an error: commit the (empty) transaction.
          if (!nested) {
            this.raw.exec("COMMIT");
          }
          return { status: "conflict" };
        }

        const timestamp = new Date().toISOString();
        const userId = randomUUID();

        this.db.insert(appBootstrapState).values({
          singleton: 1,
          createdAt: timestamp,
          userId,
        }).run();

        this.db.insert(user).values({
          id: userId,
          name: input.name,
          phoneNumber: input.phone,
          phoneNumberVerified: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        }).run();

        this.db.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: input.passwordHash,
          createdAt: timestamp,
          updatedAt: timestamp,
        }).run();

        if (!nested) {
          this.raw.exec("COMMIT");
        }
        return {
          status: "created",
          user: { id: userId, name: input.name, phone: input.phone },
        };
      } catch (err) {
        if (!nested) {
          try {
            this.raw.exec("ROLLBACK");
          } catch {
            // Ignore ROLLBACK failures so the original error surfaces.
          }
        }
        // A concurrent bootstrap (or any pre-existing conflicting row) surfaces
        // as a UNIQUE violation on the singleton/phone keys — map it to the same
        // conflict outcome as the in-transaction check.
        if (isUniqueConstraintError(err)) {
          return { status: "conflict" };
        }
        throw err;
      }
    });
  }

  async hasConfiguredUsers(): Promise<boolean> {
    const userCount = await this.db
      .select({ count: count() })
      .from(user)
      .where(sql`${user.phoneNumber} IS NOT NULL AND TRIM(${user.phoneNumber}) != ''`);

    const stateCount = await this.db
      .select({ count: count() })
      .from(appBootstrapState)
      .where(eq(appBootstrapState.singleton, 1));

    return (userCount[0]?.count ?? 0) > 0 || (stateCount[0]?.count ?? 0) > 0;
  }

  async isBootstrapOwner(userId: string): Promise<boolean> {
    const stateRows = await this.db
      .select({ userId: appBootstrapState.userId })
      .from(appBootstrapState)
      .where(eq(appBootstrapState.singleton, 1))
      .limit(1);

    if (stateRows[0]?.userId) {
      return stateRows[0].userId === userId;
    }

    const firstUser = await this.db
      .select({ id: user.id })
      .from(user)
      .orderBy(user.createdAt)
      .limit(1);

    return firstUser[0]?.id === userId;
  }
}
