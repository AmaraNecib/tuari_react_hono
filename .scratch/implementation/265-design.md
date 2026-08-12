# Design — Composition root follow-ups: persist DB key after rekey, graceful shutdown, schema executor global

**Issue:** [#265](https://github.com/AmaraNecib/tuari_react_hono/issues/265)
**Tier:** High-assurance — item 1 touches the database encryption-key change
path (crypto). The owner's audit comment (2026-08-07) calls it "the
highest-severity open item in the audit" and supplies four guardrails; two are
API-side, one is desktop-side (Rust shell key rotation), one keeps the existing
result contract.
**Base:** `origin/develop` @ `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2` (clean tree, merge-base == HEAD)
**Branch:** `refactor/issue-265` (current)
**Scope:** Closes #265 (all three items). Touches `apps/api` (composition root),
`apps/desktop/src-tauri` (key rotation), `apps/web` (orchestration).

## Problem

Three follow-ups deferred from the #198 debate:

1. **🟠 Rekey does not persist the new key** — `DatabaseKeyManager.changeKey`
   verifies the current key with `PRAGMA key` + `SELECT COUNT(*) FROM
   sqlite_master` on the **already-open** shared connection. SQLCipher ignores
   `PRAGMA key` after first read → verification can never fail — and on an
   *unencrypted* DB the COUNT succeeds regardless (owner audit). After a
   successful rekey nothing persists the new key; next restart decrypts with
   the stale key → `file is not a database` → permanent loss of the encrypted
   DB (incl. WAL).
2. **🟡 No graceful shutdown** — `index.ts` has no SIGINT/SIGTERM handler;
   `AppDependencies.close()` is only exercised by tests.
3. **🟡 `schema.ts` `_executor` module-global** — `ensureDatabaseSchema` sets a
   process-global executor; concurrent `createAppDependencies` calls would
   interleave and a closed connection stays referenced.

## Owner guardrails (issue comment)

1. Rust shell owns key rotation; atomically rotate `app-db.key` **before** rekeying.
2. Verify the current key on a **fresh** connection (or scratch copy of the DB file).
3. Fail explicitly when the DB is currently unencrypted.
4. Keep the discriminated `DatabaseKeyChangeResult` from #268.

## Target architecture

```
web (SecuritySection dialog)
  └── recovery-key-hooks useChangeDbEncryptionKeyMutation
        ├── [desktop] invoke rotate_db_key(newKey)   ← Rust shell rotates app-db.key first
        ├── rpc changeDbEncryptionKey({currentKey, newKey})
        │     └── handler → databaseKeyManager.changeKey(currentKey, newKey)
        │           ├── fresh-connection verification (guardrail 2/3)
        │           └── PRAGMA rekey on shared connection
        │     └── handler → databaseKeyPersister.persistKey(newKey)   ← config db_key
        └── [desktop, on RPC failure] invoke restore_db_key()  ← roll back rotation
```

## Public API changes

### 1. `src/infrastructure/database/database-key-manager.ts`

The port interface is unchanged from #198 (`changeKey(currentKey, newKey)`)
and storage-agnostic — the app never sees SQLite types, paths, or connection
mechanics. The adapter gains the fresh-connection verification internally; the
composition root still calls `createDatabaseKeyManager(sharedDatabase)`
exactly as #198 did:

```typescript
export interface DatabaseKeyManager {
  changeKey(currentKey: string, newKey: string): DatabaseKeyChangeResult;
}
// Adapter — all SQLite/SQLCipher knowledge lives here.
export function createDatabaseKeyManager(
  sqlite: BetterSqliteDatabase,
  seams?: { databasePath?: string; openConnection?: (path: string, key: string) => BetterSqliteDatabase },
): DatabaseKeyManager
```

`changeKey(currentKey, newKey): DatabaseKeyChangeResult` (discriminated result
unchanged — guardrail 4):

1. **Encryption detection** (real files only): the adapter reads the first 16
   bytes of the database path (resolved from the connection's own `name`, or a
   test seam). Equal to the plain-SQLite magic `"SQLite format 3\0"` →
   `{ success: false, error: "Database is not encrypted" }` (guardrail 3). Any
   other header (SQLCipher writes a 16-byte random salt first) → encrypted.
   `:memory:` / missing / < 16-byte file → fall through to shared-connection
   verification (preserves dev + test behavior on plain better-sqlite3).
2. **Encrypted DB → fresh-connection verification** (guardrail 2): open a
   scratch connection with `currentKey` (via the factory by default), `SELECT
   COUNT(*) FROM sqlite_master`, close in `finally`. Wrong key throws (`file is
   not a database`) → `{ success: false, error: "Current encryption key is invalid" }`.
   The scratch connection never touches the shared one.
3. **Rekey** on the shared connection with `newKey` (unchanged); failure →
   `{ success: false, error: "Database re-encryption failed" }`.

Per the ports-and-adapters philosophy (the app does not know sqlite or
postgres), the composition root and handlers depend only on the
`DatabaseKeyManager` port — the database path, the scratch connector, and the
header sniffing are all adapter-internal; test seams are optional overrides.

### 2. NEW `src/infrastructure/database/database-key-persister.ts`

```typescript
export interface DatabaseKeyPersister {
  persistKey(newKey: string): DatabaseKeyChangeResult;  // never throws
}
export function createConfigFileKeyPersister(configFilePath: string | null): DatabaseKeyPersister
```

- `configFilePath` null → `{ success: true }` (skip; documented caller contract
  in JSDoc — the desktop host owns rotation via its keyring; the API persister
  is the file-driven fallback).
- Otherwise read-modify-write the config JSON: preserve all existing fields,
  set `db_key` = newKey, write atomically (tmp file + rename). Read/parse/write
  failure → `{ success: false, error: "Failed to persist database encryption key" }`.
  Result shape mirrors the wire output (per the #198 "port result types mirror
  the wire output shape" principle).

### 3. `src/config/loader.ts`

- `configFileSchema` gains optional `db_key: z.string().min(8).optional()`.
- `mergeConfigIntoEnv`: `file.db_key` → `APP_DB_KEY` **only when env
  `APP_DB_KEY` is unset** (env wins, per the existing merge convention). The
  file-driven deployment (web-only, non-desktop) survives restarts; the
  desktop's env-pinned key is handled by the Rust-shell rotation instead.

### 4. `src/app/dependencies.ts`

- `AppDependencies` gains `databaseKeyPersister: DatabaseKeyPersister`.
- `createAppDependencies` builds the persister from the resolved config-file
  path (`process.env.TUARI_CONFIG_FILE`; null when unset).
- `createDatabaseKeyManager(sharedDatabase)` stays exactly as #198 — the
  adapter resolves the path and scratch connector itself, so the composition
  root gains no SQLite knowledge.

### 5. `src/rpc/handlers/system.ts` + `src/rpc/router.ts`

- `createSystemHandlers` gains a `databaseKeyPersister` parameter; forwarded
  from `router.ts` via `RouterDependencies`.
- `changeDbEncryptionKey` handler: `changeKey` → on success,
  `persistKey(newKey)`; a persistence failure surfaces honestly (the DB was
  rekeyed but the key could not be persisted — no silent skip).

### 6. `src/index.ts` — graceful shutdown (item 2)

Extract a testable helper `src/app/shutdown.ts`:

```typescript
export type ShutdownTargets = {
  close: () => void;                       // AppDependencies.close (idempotent)
  stopServer: () => Promise<void> | void;  // server.close()
};
export function installShutdownHook(targets: ShutdownTargets, options?: {
  signals?: NodeJS.Signals[]; log?: (m: string) => void;
}): () => void;  // returns cleanup (remove listeners)
```

- On SIGINT/SIGTERM: log, `stopServer()` (stop accepting), then `close()`
  (closes the sqlite connection → WAL checkpoint on last-connection close),
  then `process.exit(0)`.
- Registered once in `main()`; unit-tested with fakes (no process.exit in
  tests — the helper takes an injectable `exit`).

### 7. `src/infrastructure/database/schema.ts` — remove the global (item 3)

- Delete `_executor` and `getExecutor()`.
- Thread `db: DbExecutor` through every helper and migration runner:
  `getTableColumns(db, …)`, `hasColumn(db, …)`, `getTableSql(db, …)`,
  `hasStatusCheckConstraints(db)`, `syncLegacyTimestampColumns(db)`,
  `ensureInventoryProjectIndexes(db)`, `repairLegacyAuthTables(db)`,
  `runObsoleteMigrations(db)`, `runStatusConstraintMigrations(db)`,
  `runActorLabelBackfillMigration(db)`, `runDebtSingleAccountMigration(db)`,
  `runAddOutboundTransferMigration(db)`, `runAddAdvanceDebtEntryMigration(db)`,
  `runInvoiceDebtLinkageMigration(db)`, `runDebtEntryConstraintsMigration(db)`,
  `runDebtAccountBalanceRenameMigration(db)`, `runDebtAccountDirectionMigration(db)`,
  `ensureSeedRoles(db)`, `ensureSeedRolePermissions(db)`,
  `runRbacThreeRoleMigration(db)`.
- `ensureDatabaseSchema(db)` keeps its signature; the exported `apply*`
  functions already take `db` — unchanged.
- Concurrency-safe by construction (no process-global state).

### 8. Desktop — Rust shell key rotation (guardrail 1)

`apps/desktop/src-tauri/src/lib.rs`:

- `SecretStore` gains `delete(account)` (keyring `delete_credential`; file store
  removes the file).
- Managed state `DatabaseKeyRotation { store: SecretStore, previous: Mutex<Option<String>> }`
  — the store is built in `load_runtime_secrets`; `previous` holds the value
  that was current before the last rotation (for rollback).
- New commands (each `assert_sensitive_command_window`-gated like
  `desktop_api_request`):
  - `rotate_db_key(new_key: String) -> Result<(), String>`: read current key
    (`previous`), write `new_key` to the store atomically.
  - `restore_db_key() -> Result<(), String>`: restore `previous` (write it
    back), or delete when there was no previous key.
- The commands are unconditional (no license gate): on a license without
  `encrypted_db` the DB is unencrypted and the API RPC fails explicitly with
  "Database is not encrypted" — the web rollback then restores the (unchanged)
  key. No new failure mode.

### 9. Web — orchestration (`apps/web/src/features/app-shell/recovery-key-hooks.ts`)

`useChangeDbEncryptionKeyMutation` (or a wrapper in the same file) becomes
desktop-aware without touching `SecuritySection`:

1. Desktop runtime: `invoke("rotate_db_key", { newKey })` first. Command
   failure → surface the error, do not call the RPC.
2. Call the RPC `changeDbEncryptionKey({ currentKey, newKey })`.
3. RPC failure (discriminated failure or thrown error) → best-effort
   `invoke("restore_db_key")`, then surface the RPC error.
4. Non-desktop runtime: RPC only (the API's unencrypted failure surfaces).

## Planned tests

### Unit (vitest)

- `database-key-manager.test.ts` (rewritten):
  - unencrypted real file → `{ success: false, error: "Database is not encrypted" }`, rekey never runs;
  - encrypted (mock header) + fresh-connection verification OK → rekey runs, `{ success: true }`;
  - encrypted + fresh-connection verification throws (wrong key) → `"Current encryption key is invalid"`, rekey never runs, scratch connection closed;
  - `:memory:` → shared-connection verification (legacy behavior) → success;
  - rekey throws → `"Database re-encryption failed"`;
  - quote escaping unchanged (mock sqlite + fake opener).
- `database-key-persister.test.ts` (new):
  - writes `db_key` into a temp config file preserving other fields;
  - atomic write (no partial file on simulated failure);
  - null path → `{ success: true }` skip;
  - unreadable/invalid JSON → honest failure, never throws.
- `loader.test.ts`: `db_key` merges into `APP_DB_KEY` when env unset; env wins when set; schema accepts/rejects.
- `shutdown.test.ts` (new): signal fires stopServer then close then exit; cleanup removes listeners; close-once.
- `dependencies.test.ts`: `databaseKeyPersister` wired (in-memory); `databaseKeyManager` gets the path + opener.
- `router.test.ts`: harness gains `databaseKeyPersister` stub; success path asserts `changeKey` then `persistKey` called with the new key; failure path asserts `persistKey` NOT called.
- `schema-migrations.test.ts` / other schema tests: unchanged behavior (threading refactor is internal).

### Rust (cargo)

- `rotate_db_key` / `restore_db_key` round-trip on a file-backed `SecretStore`
  (temp dir); restore-after-failed-rotate restores the previous value; delete
  when no previous.

### Playwright E2E

No new user-facing flow (the change-key dialog needs a real encrypted DB, which
the dev E2E DB is not). The existing suite is the regression guard; the recovery
keys spec stays green.

## Implementation risks

1. **Fresh-connection verification needs a real file** — `:memory:` falls back
   to shared-connection verification (legacy behavior). Tests cover both paths.
2. **sqlcipher binding absent in the workspace** — `openConnection` defaults to
   `createDatabaseConnection`, which throws a clear error when the binding is
   missing; only reached for genuinely encrypted DBs (desktop). Unit tests
   inject a fake opener; the unencrypted detection fires first for plain files.
3. **Desktop env beats config `db_key`** — documented: the desktop deployment
   relies on the Rust-shell rotation (guardrail 1); the API persister covers
   file-driven deployments. The two sources of truth are reconciled by the
   rotation + rollback commands.
4. **`schema.ts` threading touches many private functions** — behavior is
   preserved; the exported `apply*` signatures are unchanged; schema tests stay
   green.
5. **issue-234 (zwsp-trim) is in-flight in a sibling worktree** touching
   `router.test.ts` (additive, different region) and `contracts/src/security.ts`
   (not touched here). Merge conflicts, if any, are text-level and resolvable.

## Deviations from the issue text

- Item 1's "document or automate" is implemented as **both**: the API
  `DatabaseKeyPersister` automates file-driven persistence and the desktop
  `rotate_db_key`/`restore_db_key` commands automate the primary (desktop)
  deployment per the owner's guardrail 1. The port JSDoc documents the caller
  contract.
- The owner's guardrails 2/3 (fresh-connection verification, explicit
  unencrypted failure) are implemented in the API port.
- No contract (packages/contracts) changes — `changeDbKeyOutputSchema` is kept.
