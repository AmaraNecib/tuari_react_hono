# #177 remaining: Ports & Adapters architecture + config module

## Goal

Make the data layer swappable (SQLite ↔ Postgres ↔ InMemory) without touching business logic. The user configures the adapter once (config file or Settings UI) and the app uses it.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Domain services                       │
│  (workforce.service.ts, operations.service.ts, ...)      │
│  Depend ONLY on port interfaces (EmployeeRepository)    │
└──────────────────────┬──────────────────────────────────┘
                       │ interface
┌──────────────────────▼──────────────────────────────────┐
│                     Ports                                │
│  workforce/employee.repository.ts       (already done)  │
│  company/workforce.repository.ts        (exists)        │
│  company/operations.repository.ts       (exists)        │
│  company/finance.repository.ts          (exists)        │
│  company/audit.repository.ts            (exists)        │
└──────────────────────┬──────────────────────────────────┘
                       │ implements
┌──────────────────────▼──────────────────────────────────┐
│                Adapters (swappable)                      │
│                                                          │
│  SqliteEmployeeRepository    ← talks to Drizzle/SQLite  │
│  SqliteWorkforceRepository   ← direct Drizzle queries   │
│  SqliteOperationsRepository                               │
│  SqliteFinanceRepository                                   │
│  SqliteAuditRepository                                     │
│                                                          │
│  InMemoryEmployeeRepository   ← for tests                │
│  InMemoryWorkforceRepository                               │
│  ...                                                      │
│                                                          │
│  PostgresEmployeeRepository   ← future, just write it   │
│  ...                                                      │
└──────────────────────┬──────────────────────────────────┘
                       │ created by
┌──────────────────────▼──────────────────────────────────┐
│            Config + Factory (composition root)           │
│                                                          │
│  apps/api/src/config/                                    │
│  ├── index.ts          ← reads env + config file         │
│  ├── database.ts       ← createXxxRepository() factories │
│  └── config.json       ← user's app data directory       │
│                                                          │
│  // Example:                                             │
│  export function createEmployeeRepository(db: any) {     │
│    switch (config.db_adapter) {                          │
│      case "sqlite":   return new SqliteEmployeeRepository(drizzleDb)      │
│      case "postgres": return new PostgresEmployeeRepository(pgPool)       │
│      case "inmemory": return new InMemoryEmployeeRepository()             │
│    }                                                     │
│  }                                                       │
└──────────────────────────────────────────────────────────┘
```

## Files to create/modify

### Phase 1: Config module (foundation)

| File | Action | What |
|------|--------|------|
| `apps/api/src/config/index.ts` | **Create** | Read env vars + config file, validate with zod, export typed config |
| `apps/api/src/config/database.ts` | **Create** | Adapter factory functions — `createEmployeeRepository()`, `createWorkforceRepository()`, etc. |
| `apps/api/src/config/config.test.ts` | **Create** | Tests for config validation |

### Phase 2: Per-domain port narrowing

| File | Action | What |
|------|--------|------|
| `company/workforce.service.ts` | **Modify** | Switch from `CompanyRepository` → `WorkforceRepository` |
| `company/operations.service.ts` | **Modify** | Switch from `CompanyRepository` → `OperationsRepository` |
| `company/finance.service.ts` | **Modify** | Switch from `CompanyRepository` → `FinanceRepository` |
| `company/audit.service.ts` | **Modify** | Switch from `CompanyRepository` → `AuditRepository` |

**Cross-domain concern**: Services that need data from another domain should receive that other module's port interface as a second constructor dependency, or call another service. No more shared `CompanyRepository` — each domain owns its data.

### Phase 3: Split SqliteCompanyRepository into per-domain adapters

| File | Action | What |
|------|--------|------|
| `company/adapters/sqlite-workforce.repository.ts` | **Create** | `SqliteWorkforceRepository` implements `WorkforceRepository` — direct Drizzle queries |
| `company/adapters/sqlite-operations.repository.ts` | **Create** | `SqliteOperationsRepository` implements `OperationsRepository` |
| `company/adapters/sqlite-finance.repository.ts` | **Create** | `SqliteFinanceRepository` implements `FinanceRepository` |
| `company/adapters/sqlite-audit.repository.ts` | **Create** | `SqliteAuditRepository` implements `AuditRepository` |
| `company/adapters/index.ts` | **Create** | Barrel export |
| `company/sqlite-company.repository.ts` | **Delete** (after split) | Old 844 LOC monolith — each method migrates to its domain adapter |
| `company/company.repository.ts` | **Keep as is** | Composition root (24 LOC) — becomes the factory that picks adapters |

### Phase 4: InMemory adapters

| File | Action | What |
|------|--------|------|
| `company/adapters/inmemory-workforce.repository.ts` | **Create** | `InMemoryWorkforceRepository` — follows `workforce/adapters/in-memory-employee.repository.ts` pattern |
| `company/adapters/inmemory-operations.repository.ts` | **Create** | |
| `company/adapters/inmemory-finance.repository.ts` | **Create** | |
| `company/adapters/inmemory-audit.repository.ts` | **Create** | |

### Phase 5: Config file support (desktop)

| File | Action | What |
|------|--------|------|
| `apps/api/src/config/loader.ts` | **Create** | Reads from `%APPDATA%/tuari/config.json` or env |
| Tauri side | **Modify** | Pass `config.json` path to sidecar on startup |

## Config schema (what goes in config.json)

```json
{
  "db_adapter": "sqlite",
  "db_path": "data/tuari.sqlite",
  "pg_host": "localhost",
  "pg_port": 5432,
  "pg_database": "tuari",
  "pg_user": "tuari",
  "pg_password": "",
  "pg_ssl": true
}
```

Required fields checked at startup — if `db_adapter: "postgres"` but `pg_host` is missing, the app panics with a clear message.

## Config env vars override

If env vars are set (e.g., running in CI or from terminal), they override the config file:

```
DB_ADAPTER=postgres PG_HOST=prod-db.example.com tuari
```

## Migration question

When a user switches from SQLite → Postgres:

1. They set up a Postgres server (needs Postgres version 14+ for minimum feature support)
2. They update `config.json` → `"db_adapter": "postgres"` + fill in PG connection details
3. They run a one-time migration script: `tuari migrate --to postgres` (future work)
4. They restart the app — it now uses Postgres
5. The same binary works. No reinstall needed.

The adapter pattern means **the app doesn't care which DB is behind the port interface**. The migration (moving data) is a separate step.

## Work order

```
Phase 1: Config module          → can start immediately
    ↓
Phase 2: Narrow ports           → blocked on Phase 1 (needs config to select adapter)
    ↓
Phase 3: Split SqliteRepository → blocked on Phase 2 (ports must be clean first)
    ↓
Phase 4: InMemory adapters      → blocked on Phase 3 (needs target interfaces)
    ↓
Phase 5: Config file + desktop  → can be done in parallel with Phase 2-4
```

## Reference files

- `apps/api/src/modules/workforce/employee.repository.ts` — port interface example
- `apps/api/src/modules/workforce/adapters/in-memory-employee.repository.ts` — InMemory adapter example
- `apps/api/src/modules/workforce/adapters/employee.repository.ts` — current SQLite adapter (needs rewriting to be self-contained)
- `apps/api/src/infrastructure/config/database-env.ts` — current env reading (to be replaced by new config module)
- `apps/api/src/infrastructure/database/factory.ts` — current DB connection factory
