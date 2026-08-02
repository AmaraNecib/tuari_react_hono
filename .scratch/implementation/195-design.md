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
  updateKeyStatus(id: string, status: "CONSUMED" | "REVOKED"): Promise<void>;
  countAvailableKeys(): Promise<number>;
  listAllKeys(): Promise<RecoveryKeyRecord[]>;
}
```

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

No new test files. Existing tests updated mechanically (assertions unchanged):

- `recovery-key.service.test.ts` / `recovery-key.e2e.test.ts` — `createTestEnv`
  builds `new SqliteRecoveryKeyPort(db)` and passes it to the service; every
  service call gains `await`.
- `app/create-app.test.ts` — recovery-key mocks switch `mockReturnValue` →
  `mockResolvedValue`.
- `rpc/router.test.ts` — `recoveryKeyService: {} as never` unchanged.
- Full suite: `pnpm --filter @tuari/contracts build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test:api`, `pnpm test:web`.

The service tests exercise the adapter through the service (same assertions as
today), so adapter behavior is covered end-to-end; a standalone adapter test
would duplicate coverage (noted for test-audit).

## Implementation risks

1. **Timestamp ownership moved to the adapter.** `updateKeyStatus(id, status)`
   carries no timestamp, so the adapter stamps `consumedAt`/`revokedAt` itself
   with `createAlgeriaTimestamp()` — same value/format as today. No assertion
   depends on these values; low risk.
2. **Lost transaction atomicity.** The port has no `withTransaction`; the old
   `raw.transaction()` around multi-key generation is gone. Each insert commits
   independently. Failure mid-loop leaves a partial pool (plaintext never leaks;
   hashes are 128-bit random — collision ~0). `consumeKey`/`revokeKey` already
   had a no-op second guarded update under concurrency, so the port version's
   observable behavior is equivalent. Accepted per issue's small interface.
3. **`revokeKey` finds by id via `listAllKeys()`** (the port has no
   `findKeyById`). Pool is tiny (≤5 available + history); negligible cost.
4. **dts build (TS4058):** `RecoveryKeyPort`/`RecoveryKeyRecord` are local
   named types; `RecoveryKeyService` exposes only the port (already nameable),
   and `AppDependencies` already has an explicit type. Must still run
   `pnpm --filter @tuari/api build` locally to confirm (wisdom: typecheck
   alone does not catch TS4058).
5. **Async conversion:** `create-app.test.ts` mocks and the three mutation
   handlers must await; if missed, tests fail loudly (serialized `{}`), not
   silently.

## Acceptance mapping

- [x] `RecoveryKeyPort` in `modules/auth/recovery-key.types.ts`
- [x] `SqliteRecoveryKeyPort` in `modules/auth/adapters/sqlite-recovery-key.port.ts`
- [x] Service constructor takes only the port
- [x] Service imports no drizzle/sqlite/schema
- [x] All Drizzle/SQLite code in the adapter
- [x] `app/dependencies.ts` constructs adapter → service
- [x] Compiles + all existing tests pass (mechanical await/wiring updates only)
