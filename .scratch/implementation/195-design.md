# Design — Introduce RecoveryKeyPort for RecoveryKeyService

**Issue:** #195
**Part of:** #191 (Persistence Boundary Refactoring)
**Tier:** High-assurance (recovery keys are security/credentials)
**Base SHA:** 80d4926f029c3facee7dd17eb28da174c6e01f3b (`origin/develop`)
**Design Date:** 2026-08-08

## Objective

`RecoveryKeyService` currently depends on `BetterSQLite3Database<typeof schema>`,
`BetterSqliteDatabase`, and the Drizzle schema directly. Extract a small
`RecoveryKeyPort` interface so the service depends on a persistence boundary,
not on Drizzle/SQLite. Business logic (key generation, hashing, pool rules,
validation) stays in the service.

## Public API

### `modules/auth/recovery-key.types.ts` (new)

Domain/persistence types + the port interface, exactly as specified in #195:

```typescript
export type RecoveryKeyStatus = "AVAILABLE" | "CONSUMED" | "REVOKED";

export interface RecoveryKeyRecord {
  id: string;
  prefix: string;
  keyHash: string;
  status: RecoveryKeyStatus;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface RecoveryKeyInsert {
  id: string;
  prefix: string;
  keyHash: string;
  status: RecoveryKeyStatus;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface RecoveryKeyPort {
  insertKey(input: RecoveryKeyInsert): Promise<void>;
  findKeyByHash(hash: string): Promise<RecoveryKeyRecord | null>;
  /** Flip a key to CONSUMED/REVOKED. Returns false if it was no longer AVAILABLE. */
  updateKeyStatus(id: string, status: "CONSUMED" | "REVOKED"): Promise<boolean>;
  countAvailableKeys(): Promise<number>;
  listAllKeys(): Promise<RecoveryKeyRecord[]>;
  /** Run a flow atomically (all-or-nothing). Not reentrant. */
  withTransaction<T>(run: () => Promise<T>): Promise<T>;
}
```

> **Deviations from the issue sketch (debate-driven, see below):**
> `updateKeyStatus` returns `Promise<boolean>` instead of `Promise<void>`
> (guarded check-and-set), and `withTransaction` was added. Both are required
> to preserve the old synchronous code's security invariants once the port
> introduces `await` yield points (see Risks #2).

- Port methods are async (per issue spec; matches the codebase's other module
  boundaries: `InvoiceDebtPort`, `AccountRepository`, `PaymentRepository`).
- The service's presentation types (`GeneratedRecoveryKey`,
  `RecoveryKeyPoolStatus`) stay in `recovery-key.service.ts` — they describe
  the service's return surface, not persistence.

### `modules/auth/adapters/sqlite-recovery-key.port.ts` (new)

```typescript
export class SqliteRecoveryKeyPort implements RecoveryKeyPort {
  constructor(db: BetterSQLite3Database<typeof schema>);
}
```

- The **only** file allowed to import `drizzle-orm` / `schema` / sqlite types.
- `updateKeyStatus` sets the status-specific timestamp itself
  (`consumedAt` for CONSUMED, `revokedAt` for REVOKED) via
  `createAlgeriaTimestamp()` (same format the service uses today).
  The port signature has no timestamp param, so timestamp ownership moves
  to the adapter (documented trade-off, see Risks).
- Drizzle row → `RecoveryKeyRecord` mapping normalizes `status: string` to
  `RecoveryKeyStatus` (cast, same as the current service does).

### `modules/auth/recovery-key.service.ts` (refactor)

Constructor changes from `(db, raw)` to `(port: RecoveryKeyPort)`. Methods
become async (mechanical, no behavioral change):

- `generateKeys(): Promise<GeneratedRecoveryKey[]>` — counts available via
  `port.countAvailableKeys()`, generates plaintext + hash + prefix, inserts
  via `port.insertKey(...)`. All generation/hashing logic unchanged.
- `consumeKey(plainKey): Promise<boolean>` — hashes input, finds via
  `port.findKeyByHash(hash)`, validates `status === "AVAILABLE"`, then
  `port.updateKeyStatus(id, "CONSUMED")`.
- `revokeKey(keyId): Promise<boolean>` — locates the record via
  `port.listAllKeys()`, validates `status === "AVAILABLE"`, then
  `port.updateKeyStatus(id, "REVOKED")`.
- `getPoolStatus(): Promise<RecoveryKeyPoolStatus>` — via `port.listAllKeys()`.

Service imports: `node:crypto`, `RecoveryKeyPort`/types, `company-time` only.
No `drizzle-orm`, no `better-sqlite3`, no `schema` (acceptance criterion).

### `app/dependencies.ts`

```typescript
const recoveryKeyService = new RecoveryKeyService(new SqliteRecoveryKeyPort(db));
```

### `rpc/handlers/system.ts`

The `getRecoveryKeyPool` handler already returns through an async function —
no change. The three mutation callbacks become `async` and `await` the service
(they currently call the sync service inside non-async callbacks; the returned
Promise would otherwise serialize as `{}`).

## Dependencies

- `SqliteRecoveryKeyPort` → `drizzle-orm`, `drizzle-orm/better-sqlite3`,
  `../../schema`, `../recovery-key.types`, `../../company/company-time`.
- `RecoveryKeyService` → `recovery-key.types`, `company-time`, `node:crypto`.
- No new npm packages. No changes to `@tuari/contracts` (RPC response shapes
  unchanged — ORPC unwraps handler promises).

## Planned tests

Existing tests updated mechanically (assertions unchanged):

- `recovery-key.service.test.ts` / `recovery-key.e2e.test.ts` — shared
  `test-helpers/recovery-key-env.ts` builds a real `SqliteRecoveryKeyPort` +
  service (file-based SQLite, full schema); every service call gains `await`.
- `app/create-app.test.ts` — recovery-key mocks switch `mockReturnValue` →
  `mockResolvedValue`.
- `rpc/router.test.ts` — `recoveryKeyService: {} as never` unchanged.

New tests (added after the test audit — the acceptance criteria say existing
assertions stay unchanged, which they do):

- `recovery-key.service.test.ts`: concurrency regressions (same-key double
  consume succeeds once; concurrent generate ≤ pool cap, exact 5), pool
  boundaries (4→1, full→[]), revoked/empty/uppercase consume rejection,
  consume-vs-revoke race, timestamp stamping (DB-level).
- `adapters/sqlite-recovery-key.port.test.ts` (new): guarded check-and-set,
  rollback on error with lock release, loud reentrancy rejection,
  unknown-hash lookup.
- Full suite: `pnpm --filter @tuari/contracts build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test:api`, `pnpm test:web`.

Note: adapter behavior is additionally exercised end-to-end through the
service tests, so a standalone adapter test file was added only for the
primitives the service never exercises directly (rollback, lock release,
reentrancy).

## Implementation risks

1. **Timestamp ownership moved to the adapter.** `updateKeyStatus(id, status)`
   carries no timestamp, so the adapter stamps `consumedAt`/`revokedAt` itself
   with `createAlgeriaTimestamp()` — same value/format as today. No assertion
   depends on these values; low risk.
2. **Async port reintroduces concurrency races — fixed with atomic primitives.
   (Debate blocker #1/#3.)** The old service was fully synchronous: the
   event loop could never interleave two calls, so `consumeKey`'s
   read-then-guarded-update and `generateKeys`' count-then-inserts were
   implicitly serialized. The async port splits these across `await` points:
   - `consumeKey`/`revokeKey`: two concurrent consumers could both read
     AVAILABLE and both update → key consumed twice (one-time-use broken).
     **Fix:** `updateKeyStatus` is a guarded check-and-set (`WHERE id = ? AND
     status = 'AVAILABLE'`) returning rows-affected; the loser's update is a
     0-row no-op → exactly one caller wins, and a stale revoke/consume can
     never produce a record with both `consumedAt` and `revokedAt` set.
   - `generateKeys`: two concurrent calls could both count 0 and insert 3 →
     6 keys (max-pool-5 violated), and a mid-loop failure left a partial pool.
     **Fix:** `withTransaction` on the port wraps count+inserts
     (BEGIN IMMEDIATE/COMMIT/ROLLBACK — the repo's established better-sqlite3
     async pattern, see bootstrap.service.ts) with a FIFO mutex so flows run
     strictly one-at-a-time, reproducing the old sequential semantics
     (second caller sees the first's committed inserts → replenishes to cap).
     Partial failures roll back; no orphaned rows.
3. **`revokeKey` finds by id via `listAllKeys()`** (the port has no
   `findKeyById`). Pool is tiny (≤5 available + history); negligible cost.
4. **dts build (TS4058):** `RecoveryKeyPort`/`RecoveryKeyRecord` are local
   named types; `RecoveryKeyService` exposes only the port (already nameable),
   and `AppDependencies` already has an explicit type. Must still run
   `pnpm --filter @tuari/api build` locally to confirm (wisdom: typecheck
   alone does not catch TS4058).
5. **Async conversion:** `create-app.test.ts` mocks and the three mutation
   handlers must await; if missed, tests fail loudly (serialized `{}`), not
   silently. `mutationAudit`'s sync try/catch only guards sync throws — this
   matches the pre-existing pattern for every async service (finance,
   inventory); rejections propagate to ORPC as before.
6. **Entropy comment corrected:** the key is 18 hex chars = 72 bits, not 128
   (was mis-documented in the old code); `randomBytes(16)` sliced — extra
   bytes discarded. Comment now accurate; generation logic unchanged.

## New regression tests (debate-driven)

- Concurrent `consumeKey` of the same key → exactly one success.
- Concurrent `generateKeys` → pool never exceeds 5.

Both fail against the un-guarded port and pass with the guarded update +
serialized `withTransaction`.

## Acceptance mapping

- [x] `RecoveryKeyPort` in `modules/auth/recovery-key.types.ts`
- [x] `SqliteRecoveryKeyPort` in `modules/auth/adapters/sqlite-recovery-key.port.ts`
- [x] Service constructor takes only the port
- [x] Service imports no drizzle/sqlite/schema
- [x] All Drizzle/SQLite code in the adapter
- [x] `app/dependencies.ts` constructs adapter → service
- [x] Compiles + all existing tests pass (mechanical await/wiring updates only)
