# 265 — Use the DB key from the resolved application config (composition root)

## Mode / ticket / base / tier

- `mode: local-only` (remote GitHub unavailable per repo state)
- ticket: Greptile-baseline finding inherited from PR #12, #265/#352 rekey region
- branch: `fix/issue-265-dbkey-from-config`
- base: `origin/develop` @ `6be3497`; working tree clean at start
- review tier: **Standard** (config + DB startup wiring; focused scope). NOTE: this
  is crypto-adjacent (DB encryption key) so DB-open behavior is covered with tests
  and local code review; debate (High-assurance) is not required for this narrow,
  behavior-preserving startup fix.

## Problem

An encrypted deployment that relies on the **app config file** for its DB key
cannot open its database on restart.

Current key flow at startup:

1. `loadConfigFile(TUARI_CONFIG_FILE)` reads the user-editable `config.json`
   (validated `db_key` min 8).
2. `mergeConfigIntoEnv(file, source)` merges `db_key` → `effectiveSource.APP_DB_KEY`
   **only when env `APP_DB_KEY` is unset** (env always wins).
3. `createAppConfig()` builds the validated `AppConfig` from `effectiveSource`, but
   the returned `AppConfig` **carries no key field** — `effectiveSource` is a local
   copy that is discarded. The comment in `dependencies.ts` states explicitly:
   "The validated `AppConfig` carries no key field, so env is the only fallback."
4. `createAppDependencies()` → `createDatabaseConnection(databasePath, config.databaseKey)`,
   where `config.databaseKey` is the explicit injection seam (undefined in a config-file
   deployment). Inside the factory the fallback is `dbKey ?? process.env.APP_DB_KEY ?? null`
   — it reads only `process.env`, which is **not** populated by the config-file merge.

Result: config-file-keyed deployment → key resolves to `null` → plain better-sqlite3 →
`file is not a database` on restart (or, worse, a silently plain DB). This defeats the
rekey persister's whole purpose: `createConfigFileKeyPersister` writes `db_key` into the
config file "so a restart can still open the database (#265)".

## Intended design (why the injected-key path is NOT wrong)

The #265/#352 design deliberately lets the **desktop shell own rotation**:

- Desktop deployment: the host pins the key in its own secret store and sets
  env `APP_DB_KEY`. `mergeConfigIntoEnv` keeps env-wins, so `effectiveSource.APP_DB_KEY`
  is the env value; the persister is a no-op (`process.env.APP_DB_KEY ? null : ...`),
  so no plaintext key is duplicated into the user-editable config file.
- Config-file deployment (standalone / sidecar sets `TUARI_CONFIG_FILE`, env key unset):
  the rekey handler persists `db_key` into the config file only **after a verified rekey**
  (`persistKey(newKey)` runs only on `changeKey` success — confirmed in
  `apps/api/src/rpc/handlers/system.ts`). Rollback of the old key is an ENV/DESKTOP
  concern handled upstream; on a config-file deployment the persisted `db_key` always
  matches the DB key.

So the injected `config.databaseKey` (desktop host pinning / tests) stays the highest
priority; the missing piece is ONLY that the resolved app-config key is never surfaced
and never used to open the DB.

## The fix (smallest correct change)

1. **`apps/api/src/config/index.ts`** — add `databaseKey: string | null` to
   `appConfigSchema` (`z.string().nullable().default(null)`) and set it in
   `createAppConfig` from `effectiveSource.APP_DB_KEY?.trim() || null`. This hydrates
   the merged source (env-first, then config file) into the typed config. No min-length
   enforcement here: keep parity with the current permissive `process.env.APP_DB_KEY`
   fallback (an empty value still resolves to plain, exactly as today).
2. **`apps/api/src/app/dependencies.ts`** — resolve the open key as
   `config.databaseKey ?? appConfig.databaseKey` and pass it to
   `createDatabaseConnection`. Explicit injection still wins; otherwise the resolved
   app-config key (env or config file) is used. Update the `CreateAppDependenciesConfig.databaseKey`
   doc comment.
3. Keep `createDatabaseConnection`'s internal `process.env.APP_DB_KEY` fallback as a
   defensive safety net for any other direct callers (the key manager's scratch
   connections).

## No conflict with rekey / rollback

- Startup resolution only — does not change `DatabaseKeyManager.changeKey`, the
  persister, or the handler ordering.
- Desktop env-pinned: `appConfig.databaseKey` == env value; persister stays a no-op;
  injection (host pin) still wins if provided. Behavior unchanged.
- Config-file: `appConfig.databaseKey` == persisted `db_key` == DB key after a verified
  rekey. This is the intended #265 startup path.
- Rollback (restore old key on pre-delivery failure) is an upstream env/desktop concern
  and is untouched; the config-file persister only ever stores a verified new key.

## Tests

- `apps/api/src/config/config.test.ts` — `databaseKey` defaults to `null`; resolves from
  env `APP_DB_KEY`; resolves from config file `db_key` when env unset; env wins over config
  file.
- `apps/api/src/config/loader.test.ts` — (existing merge tests already cover `db_key` →
  `APP_DB_KEY`; no change needed, but verify).
- `apps/api/src/app/dependencies.test.ts` — new test proving an `appConfig` whose
  `databaseKey` is resolved from a config-file `db_key` reaches the connection factory
  (via the `dbKeyCapture` seam) when no `config.databaseKey` is injected; and that the
  injected `config.databaseKey` still wins over `appConfig.databaseKey`.

## Commands

```
pnpm --filter @tuari/contracts build
pnpm typecheck
pnpm lint
pnpm test:api            (or the specific suites)
```

## Risks / migration

- Existing tests stub `APP_DB_KEY` undefined → `appConfig.databaseKey` null → unchanged.
- No schema field is made required; `.nullable().default(null)` keeps old `AppConfig`
  literals valid and avoids breaking other consumers.
- The factory keeps its env fallback so standalone `createDatabaseConnection` callers
  are unaffected.
