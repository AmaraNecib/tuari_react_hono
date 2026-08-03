# Design — Clean the composition root: self-contained `createAppDependencies`

**Issue:** [#198](https://github.com/AmaraNecib/tuari_react_hono/issues/198)
**Tier:** High-assurance (touches the database encryption-key change path — crypto).
The rekey logic is moved verbatim, but any transcription error would be a real
security bug (wrong key accepted → data loss), so debate is required.
**Base:** `origin/develop` @ `bb49ec29335adb1564ba69bc7f1d91a2e9f43b33` (clean tree, merge-base == HEAD)
**Branch:** `refactor/issue-198-clean-composition-root` (current)
**Scope:** Part of #191 (Persistence Boundary Refactoring). Closes #198.

## Problem

`createAppDependencies(sqlite?, drizzleDb?, authInstance?, config)` receives raw
database handles as positional parameters from `index.ts`, which itself opens the
connection, runs the schema migration, builds Drizzle and better-auth, and then
hands everything down. `AppDependencies` leaks `rawDatabase: BetterSqliteDatabase`
all the way into the RPC router and the `system` handlers (which use it for
`PRAGMA key`/`PRAGMA rekey` in `changeDbEncryptionKey`).

Goal: the composition root becomes self-contained — `index.ts` calls
`createAppDependencies()` with no raw handles, and no raw handle appears in
`AppDependencies`, the router, or the handlers.

## Target architecture

```
src/index.ts (thin bootstrap)
  └── const config = createAppConfig()
        └── createAppDependencies({}, config)
              ├── createDatabaseConnection(config.databasePath ?? appConfig.databasePath, config.databaseKey)
              ├── ensureDatabaseSchema(new BetterSqlite3Executor(sharedDatabase))   ← migrations move inside
              ├── createDrizzleFromSqlite(sharedDatabase)
              ├── auth = config.authInstance ?? createAuth(db, appConfig)
              └── wire all services
                    └── returns AppDependencies (no rawDatabase; adds databaseKeyManager + close)
```

`ensureDatabaseSchema` must move inside `createAppDependencies`: once the connection
is opened inside the root, `index.ts` no longer has a handle to run migrations —
there is no other option that satisfies "index.ts calls createAppDependencies()
with no arguments".

## Public API changes

### 1. `src/infrastructure/database/factory.ts`

`createDatabaseConnection(dbKey?: string | null)` →
`createDatabaseConnection(databasePath?: string, dbKey?: string | null)`.
Path defaults to the env-resolved path (`resolveDatabaseEnv()`) when omitted;
key defaults to `process.env.APP_DB_KEY` as today. Behavior otherwise unchanged.

### 2. NEW `src/infrastructure/database/database-key-manager.ts`

Narrow port hiding the raw handle — the router/handlers must not receive a raw
database handle:

```typescript
export interface DatabaseKeyManager {
  changeKey(currentKey: string, newKey: string): boolean;
}
export function createDatabaseKeyManager(sqlite: BetterSqliteDatabase): DatabaseKeyManager
```

The implementation is the **verbatim** logic currently in the
`changeDbEncryptionKey` handler:
1. `pragma("key = '<escaped>'")` then `prepare("SELECT COUNT(*) FROM sqlite_master").get()`
   — verify the current key by touching encrypted pages; any throw → `false`.
2. `pragma("rekey = '<escaped>'")` → `true`.
Single quotes escaped with `''` doubling (unchanged).

### 3. `src/app/dependencies.ts`

```typescript
export type CreateAppDependenciesConfig = {
  databasePath?: string;
  databaseKey?: string;
  authInstance?: BetterAuthInstance;
};

export async function createAppDependencies(
  config: CreateAppDependenciesConfig = {},
  appConfig: AppConfig = createAppConfig(),
): Promise<AppDependencies>
```

- `AppConfig` stays as an appended trailing param (per `.agents/wisdom/architecture.md`
  "Keep the param appended, never inserted mid-signature") so tests can still inject
  `DB_ADAPTER=inmemory`, bootstrap key, attachments root. The issue's config-object
  shape is preserved exactly; raw handles are never accepted.
- Body: open connection → `ensureDatabaseSchema(new BetterSqlite3Executor(sharedDatabase))`
  → drizzle → auth (or `config.authInstance`) → wire services.
- `AppDependencies`:
  - **Remove** `rawDatabase: BetterSqliteDatabase` (also removes the TS4058
    dts-build landmine from #204 — the inferred return no longer inlines the
    unnameable `BetterSqlite3.Database` UMD-global).
  - **Add** `databaseKeyManager: DatabaseKeyManager` (nameable exported interface).
  - **Add** `close: () => void` — closes the shared connection. The root opens the
    connection, so the root should close it; tests need it to avoid Windows EBUSY
    when deleting temp DBs (see `.agents/wisdom/testing.md`).

### 4. `src/rpc/handlers/system.ts`

`createSystemHandlers(..., rawDatabase: BetterSqliteDatabase)` →
`createSystemHandlers(..., databaseKeyManager: DatabaseKeyManager)`.
Handler body: `changeKey` returns `boolean`; the handler maps `false` →
`{ success: false, error: "Current encryption key is invalid" }` (wire error copy
unchanged — `changeDbKeyOutputSchema` requires a non-empty failure message).

### 5. `src/rpc/router.ts`

`RouterDependencies.rawDatabase: BetterSqliteDatabase` →
`RouterDependencies.databaseKeyManager: DatabaseKeyManager`; forward to
`createSystemHandlers`.

### 6. `src/index.ts`

```typescript
const config = createAppConfig();
const appDependencies = await createAppDependencies({}, config);
const app = createApp(appDependencies, { allowedOrigins, trustProxyHeaders });
serve({ fetch: app.fetch, port: config.port, hostname: config.host });
```

All raw-handle creation, executor, migration, drizzle, auth code leaves `index.ts`.

## Planned tests

### Unit (vitest)

- **`infrastructure/database/database-key-manager.test.ts` (new)**
  - Live `:memory:` connection: `changeKey("current", "new")` → `true` (statements execute).
  - Mock connection: exact `pragma` calls `key = 'old-key'` / `rekey = 'new-key-123'`
    and single-quote escaping (`rekey = 'new-key-''quoted'''`).
  - Mock connection whose verification read throws → `false`, and `rekey` never runs.
- **`app/dependencies.test.ts` (updated to the config-object pattern)** — behavior
  preserved per test:
  1. inmemory adapter: `createAppDependencies({ databasePath: ":memory:", authInstance: fakeAuth }, config)` → `listRoles()` = `{ items: [] }`.
  2. default sqlite adapter: same call without config → `listRoles().items` has the 3
     seeded roles (admin/manager/viewer). The old assertion (throw `/no such table/`)
     relied on a schema-less db, which no longer exists since migrations now run inside.
  3/4. bootstrap setup key honored / absent: `getSetupStatus()` → `{ hasUsers: false, requiresSetupKey: <bool> }`.
  5. real auth built when `authInstance` omitted.
  6. default path resolution: env `APP_DB_PATH` → temp file, no args beyond
     `{ authInstance }` → file created, roles seeded, then `deps.close()` (avoids EBUSY).
  7. attachments root path still reaches `InventoryAttachmentStorage`.
- **`rpc/router.test.ts` (updated)**
  - `createTestRouter` harness: `rawDatabase` stub → `databaseKeyManager` stub;
    default stub now returns `changeKey: () => false` (handler maps to graceful failure).
  - "graceful failure" test: default stub → `{ success: false, error: "Current encryption key is invalid" }`.
  - "rekeys and returns success": stub `changeKey` → assert called with the key pairs
    (incl. quoted key); exact PRAGMA statements now asserted in the port's unit tests.
- **`app/create-app.test.ts` (updated)** — dependency stub `rawDatabase` →
  `databaseKeyManager: { changeKey: vi.fn() }` (create-app tests never invoke it).

### Playwright E2E

No new user-facing flow: this is a pure composition-root refactor. The existing e2e
suite (bootstrap + settings flows) is the regression guard — it boots the real API
via `pnpm dev:api` → `src/index.ts`, so it exercises the new self-contained path.
Full suite must stay green.

## Implementation risks

1. **Migration inside `createAppDependencies`** — every call (7 in the deps suite)
   runs the full `ensureDatabaseSchema` on its own `:memory:` connection. All
   migrations are existence-guarded → fast no-ops on fresh dbs. Verified cold-start
   risk is covered by the existing generous describe timeout (60s).
2. **`_executor` module state** (`schema.ts`) — `ensureDatabaseSchema` re-sets it per
   call; only migration internals read it. Within one process, concurrent
   `createAppDependencies` calls could interleave (the global would point at the
   last-opened connection) and a closed connection stays referenced until the next
   call. In practice the root is called once at startup (index.ts) and tests run
   sequentially under vitest per-file isolation, so this is latent — a dedicated
   schema.ts refactor would be the right place to remove the global.
3. **`databasePath: ":memory:"`** — `mkdirSync(dirname(":memory:"))` = `.` (exists);
   `PRAGMA journal_mode = WAL` on `:memory:` returns `"memory"` without throwing
   (confirmed by running the suite).
4. **Windows EBUSY** — temp-file tests call `deps.close()` before `rmSync`
   (wisdom requirement).
5. **Rekey logic preservation** — logic moved byte-for-byte; port unit tests pin the
   exact PRAGMA statements and quote escaping that the router test previously pinned.

## Deviations from the issue text

- `ensureDatabaseSchema` (not listed in the issue) also moves inside — required by
  self-containment; documented above.
- `AppDependencies` gains `close()` — lifecycle responsibility of the root, and
  required for test cleanup (EBUSY).
- `appConfig` remains a second, trailing parameter — the issue's config object is
  preserved exactly; AppConfig injection (DB_ADAPTER, bootstrap key, attachments
  root) cannot fold into `{ databasePath?, databaseKey?, authInstance? }` without
  bloating the issue's stated shape.
