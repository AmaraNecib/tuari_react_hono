# Phase 1 — Config Module

**Issue:** #177 (remaining)
**Part of:** Ports & Adapters architecture (Phase 1 of 5)
**Design Date:** 2026-07-29

## Objective

Create a centralised config module (`apps/api/src/config/`) that validates the
application's runtime configuration with Zod and exposes typed adapter factory
functions. This is the foundation that all later phases depend on.

## Public API

### `apps/api/src/config/index.ts`

```typescript
// Zod schema for the full app config
export const appConfigSchema = z.object({
  // Database
  dbAdapter: z.enum(["sqlite"]).default("sqlite"),
  databasePath: z.string(),
  databaseUrl: z.string().startsWith("file:"),
  attachmentsRootPath: z.string(),

  // Server
  host: z.string().default("127.0.0.1"),
  port: z.coerce.number().int().positive().default(4318),
  allowedOrigins: z.array(z.string()).default(DEFAULT_ALLOWED_ORIGINS),
  trustProxyHeaders: z.boolean().default(false),

  // Auth
  betterAuthSecret: z.string().min(1),
  betterAuthUrl: z.string(),
  bootstrapSetupKey: z.string().nullable().default(null),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

/** Read env vars (and future config file) and return a validated AppConfig. */
export function createAppConfig(
  source: NodeJS.ProcessEnv = process.env,
): AppConfig;
```

### `apps/api/src/config/database.ts`

```typescript
/** Create the Drizzle-backed CompanyRepository (composition root). */
export function createCompanyRepository(
  db: BetterSqliteDatabase,
  config: AppConfig,
): CompanyRepository;

/** Stub: will create SqliteWorkforceRepository after Phase 3. */
export function createWorkforceRepository(
  db: BetterSqliteDatabase,
  config: AppConfig,
): WorkforceRepository;

/* etc. for createOperationsRepository, createFinanceRepository, createAuditRepository */
```

## Internal Dependencies

```
config/index.ts   →  zod, dotenv (existing)
config/database.ts →  company/company.repository.ts
                       (later: per-domain repository modules)
```

No circular dependencies. `config/` depends on nothing from `modules/`.

## Planned Tests

**`config.test.ts`** (unit tests for config/index.ts):

| Test | What it verifies |
|------|-----------------|
| Default values | When no env vars are set, defaults are used (dbAdapter=sqlite, host=127.0.0.1, etc.) |
| `BETTER_AUTH_SECRET` required | Missing value throws |
| `API_PORT` accepts valid port | `"8080"` → 8080 |
| `API_PORT` rejects invalid port | `"abc"` → throws |
| `DATABASE_URL` must be file: | `"postgres://..."` → throws |
| `ALLOWED_ORIGINS` parses CSV | `"http://a.com, http://b.com"` → `["http://a.com", "http://b.com"]` |
| Production requires `BOOTSTRAP_SETUP_KEY` | `NODE_ENV=production` without key throws |
| `APP_DB_PATH` overrides default | `"./data/custom.sqlite"` is used for databasePath |
| `APP_ATTACHMENTS_ROOT` overrides default | Custom path appears in config |

**`database.test.ts`** (unit tests for config/database.ts):

| Test | What it verifies |
|------|-----------------|
| `createCompanyRepository` returns a CompanyRepository | Integration smoke test |
| Factory respects `dbAdapter` config | Future: when `inmemory` is added |

## Implementation Risks

- **Zod v4 API differences** — The workspace uses zod v4 (via `@tuari/contracts`). Need to verify API compatibility (zod v4 has some breaking changes from v3 like optional chaining).
- **Overlapping validation** — The existing `env.ts` has hand-rolled validation (port, URL normalization, CORS). The new config module must not break existing tests. We keep `env.ts` working for now and add the new module alongside it.
- **`createDatabaseConnection`** currently reads env inside `database-env.ts`. The config module will pass config explicitly, so we add an overload that accepts config instead of reading env directly.
- **No runtime coupling** — The config module must NOT import from `modules/` or `infrastructure/database/factory.ts` to avoid circular dependency chains. Factory functions access modules through a shared composition root.

## Migration Path

Phase 1 creates the config module and wires it into the app startup alongside the existing env.ts. The existing env.ts remains the "live" config source. The new config module is used by adapter factories initially, and phases 2–5 will gradually shift all consumers to use it.

```typescript
// In dependencies.ts (Phase 1):
import { createAppConfig } from "../config";
const config = createAppConfig();
const repo = createCompanyRepository(db, config);

// Later (Phase 5): config comes from config.json + env overrides
const config = createAppConfig({ env, configFile }); // ← reads env + config.json merged
```
