# Design — Unify the app config module (one `createAppConfig`, no `runtime-env`)

**Issue:** [#212](https://github.com/AmaraNecib/tuari_react_hono/issues/212)
**Tier:** Standard
**Base:** `origin/develop` @ `f93c37c0dd91646bfdc106c0e0bcc05b149b9e0c` (HEAD, clean tree)
**Scope:** Part of #211 "Wayfinder map: ship the six architecture-review deepenings".

## Problem

Two config modules compute the same runtime values and BOTH execute at runtime:

| | `src/infrastructure/config/env.ts` (`createEnv`) | `src/config/index.ts` (`createAppConfig`) |
|---|---|---|
| Fields | 10 | 11 (adds `dbAdapter`) |
| Port bounds | accepts >65535 | rejects >65535 ✅ |
| `API_HOST` trim | no | yes ✅ |
| Error type | `Error` | `ZodError` |
| Config file merge | no | yes (`loader.ts`) |

`runtime-env.ts` evaluates `createEnv()` at import time → **throws at module load**
when `BETTER_AUTH_SECRET` is missing. Only `app/dependencies.test.ts` works around it
(pre-sets env + dynamic import) — see `.agents/wisdom/process.md` "apps/api env.ts throws at module load".

Consumers read the two modules inconsistently:
- `src/index.ts` — serve bind + transport security from `env.*`
- `src/infrastructure/auth/auth.ts` — `baseURL`/`secret`/`trustedOrigins` from `env.*`
- `src/app/dependencies.ts` — receives injected `config` but **ignores** its
  `bootstrapSetupKey`/`attachmentsRootPath`, reading `env.*` instead (live internal inconsistency).

`TUARI_CONFIG_FILE` (merged by `createAppConfig`) never reaches anything `index.ts` uses.

## Target architecture

One deep module: `src/config/index.ts` exposes `createAppConfig()` + `appConfigSchema` +
`AppConfig`. All runtime consumers receive the injected `AppConfig` from the composition
root. The duplicate `createEnv`/`runtime-env` module and its test suite are deleted.

```
src/index.ts (composition root)
  └── const config = createAppConfig()          ← env + TUARI_CONFIG_FILE merge
        ├── createAuth(drizzleDb, config)       ← baseURL/secret/trustedOrigins
        ├── createAppDependencies(sqlite, drizzleDb, auth, config) ← bootstrapSetupKey, attachmentsRootPath
        ├── createApp(deps, { allowedOrigins, trustProxyHeaders })
        └── serve({ port, hostname })
```

## Public API changes

1. **`src/infrastructure/auth/auth.ts`**
   - `createAuth(drizzleDb: AppDrizzle, config: AppConfig): BetterAuthInstance`
   - Reads `config.betterAuthUrl`, `config.betterAuthSecret`, `config.allowedOrigins`.
   - Drops `import { env } from "../config/runtime-env"`.
   - `BetterAuthInstance = ReturnType<typeof createAuth>` unchanged.

2. **`src/app/dependencies.ts`**
   - Replace `env.bootstrapSetupKey` → `config.bootstrapSetupKey`.
   - Replace `env.attachmentsRootPath` → `config.attachmentsRootPath`.
   - Static-import `createAuth` and call `createAuth(db, config)` (the dynamic import was
     only a workaround for the module-load throw; removing it also removes the lazy load).
   - Signature unchanged: `config: AppConfig = createAppConfig()` (backwards-compatible default).

3. **`src/index.ts`**
   - `const config = createAppConfig();` once at startup.
   - Pass `config` to `createAuth`, `createAppDependencies`, `createApp` (transport security),
     and `serve` (bind host/port).

4. **Deleted files**
   - `src/infrastructure/config/env.ts`
   - `src/infrastructure/config/runtime-env.ts`
   - `src/infrastructure/config/env.test.ts` (11 cases duplicated by `config/config.test.ts`)

5. **`src/infrastructure/config/url.ts`** — refresh doc comment (drops the legacy-module mention).

## Tests

- **Delete** `env.test.ts` (duplicate superset cases; `config/config.test.ts` is canonical).
- **`app/dependencies.test.ts`**: remove the `process.env.BETTER_AUTH_SECRET` module-load
  workaround + stale comment; stub `BETTER_AUTH_SECRET` alongside the existing `stubEnv`s in
  the default-config test. Add an assertion proving the injected `config` is now honored:
  `bootstrapSetupKey` reaches `AuthBootstrapService` and `attachmentsRootPath` reaches
  `InventoryService`/storage.
- **`config/config.test.ts`**: unchanged (single suite).
- **E2E**: no new test — pure server-side refactor with no user-facing change; the existing
  `tests/e2e/foundation-smoke.spec.ts` boots the API through the new `index.ts` wiring
  (bind, auth, transport) and covers the critical sign-in path.

## Risks

- **Behavior parity**: `createEnv` vs `createAppConfig` divergences (port bounds, API_HOST
  trim) are resolved by keeping only `createAppConfig` — the strict superset, already the
  production intent. Covered by `config/config.test.ts`.
- **Module-load throw removal**: deleting `runtime-env` eliminates the import-time throw;
  `dependencies.test.ts` no longer needs the workaround.
- **Scope discipline**: `createDatabaseConnection()` still reads raw env via
  `resolveDatabaseEnv` (separate seam). If `TUARI_CONFIG_FILE` sets `db_path`, the SQLite
  connection would not see it — pre-existing behavior, out of scope (server bind/auth/deps
  are the issue's contract). Noted as follow-up for the config-file phase.
- **Conflict coordination**: #214 (transport seam) and #198 (composition root) are OPEN
  with no PRs and touch `dependencies.ts`/`create-app.ts`; this change keeps those seams
  untouched (only the `env.*` reads inside `dependencies.ts` are rewired to `config.*`).

## Validation

```bash
pnpm --filter @tuari/contracts build
pnpm typecheck
pnpm lint
pnpm test:api
pnpm test:web
```

Plus `rg` guard: no imports of `infrastructure/config/env.ts` or `runtime-env.ts` in `src/`.
