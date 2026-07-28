# Architecture Review: Multi-Database, Client/Server Readiness, and Effect Evaluation

**Date:** July 10, 2025  
**Reviewer:** Principal Software Architect  
**Scope:** Tuari ERP - Complete codebase analysis

---

## Part 1 — Current Architecture

### Overview

Tuari is a local-first desktop ERP built with:
- **Frontend:** React + Vite + TanStack Router/Query + shadcn/ui
- **Backend:** Hono HTTP server + oRPC (type-safe RPC)
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **Auth:** Better Auth with server-side sessions
- **Desktop Shell:** Tauri with local API sidecar process
- **Contracts:** Shared oRPC contracts between frontend/backend

### Dependency Graph

```text
┌─────────────────────────────────────────────────────────────┐
│                        Desktop Shell                        │
│                        (Tauri/Rust)                         │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  API Sidecar Process                │   │
│   │                     (Node.js)                       │   │
│   │  ┌─────────────────────────────────────────────┐   │   │
│   │  │            Hono HTTP Server                 │   │   │
│   │  │  ┌─────────────────────────────────────┐   │   │   │
│   │  │  │            oRPC Handler             │   │   │   │
│   │  │  │  ┌─────────────────────────────┐   │   │   │   │
│   │  │  │  │      Service Layer          │   │   │   │   │
│   │  │  │  │  ┌─────────────────────┐   │   │   │   │   │
│   │  │  │  │  │  Repository Layer   │   │   │   │   │   │
│   │  │  │  │  │  ┌─────────────┐   │   │   │   │   │   │
│   │  │  │  │  │  │   Drizzle   │   │   │   │   │   │   │
│   │  │  │  │  │  │    ORM      │   │   │   │   │   │   │
│   │  │  │  │  │  └─────────────┘   │   │   │   │   │   │
│   │  │  │  │  └─────────────────────┘   │   │   │   │   │
│   │  │  │  └─────────────────────────────┘   │   │   │   │
│   │  │  └─────────────────────────────────────┘   │   │   │
│   │  └─────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│                    ┌───────────────┐                         │
│                    │    SQLite     │                         │
│                    │  (local file) │                         │
│                    └───────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Layering & Separation of Concerns

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Transport | `apps/api/src/rpc/` | HTTP handling, auth guards, request/response mapping |
| Application | `apps/api/src/app/` | Dependency wiring, Hono app assembly |
| Domain Services | `apps/api/src/modules/*/` | Business logic, validation, orchestration |
| Repository | `apps/api/src/modules/*/` | Data access patterns, Drizzle queries |
| Schema | `apps/api/src/schema/` | Table definitions, relationships |
| Infrastructure | `apps/api/src/infrastructure/` | Database, auth, config, observability |

### Architectural Strengths

1. **Clean contract layer** (`packages/contracts`) ensures type safety across frontend/backend
2. **Service/Repository separation** exists conceptually
3. **Shared database migrations** are well-designed (`migration-runner.ts`)
4. **Auth model** is properly server-side (not fake cookies)
5. **oRPC** provides end-to-end type safety without code generation

### Architectural Weaknesses

1. **SQLite coupling is pervasive** — infrastructure, repositories, and even service tests assume SQLite
2. **Services are massive** — `company.service.ts` is 88KB with 2000+ lines
3. **Repository interface not abstracted** — concrete classes mixed with interfaces
4. **No adapter pattern** — repositories directly import Drizzle SQLite utilities
5. **Test infrastructure assumes SQLite** — mocking is minimal

---

## Part 2 — Database Layer

### Schema Files Analyzed

| File | Tables | SQLite-Specific Features |
|------|--------|-------------------------|
| `schema/auth.ts` | user, session, account, verification | None (portable) |
| `schema/app.ts` | role, userProfileHistory | Integer booleans (`mode: "number"`) |
| `schema/company.ts` | 15 tables | All portable except integer booleans |
| `schema/inventory.ts` | 11 tables | All portable |
| `schema/payment.ts` | 3 tables | All portable |
| `schema/invoice.ts` | 2 tables | All portable |
| `schema/recovery-key.ts` | 1 table | None |
| `schema/update.ts` | 1 table | None |

### SQLite-Specific Incompatibilities

#### 1. Integer Booleans (HIGH PRIORITY)
```typescript
// Current: SQLite convention
phoneNumberVerified: integer("phoneNumberVerified", { mode: "number" })
  .notNull()
  .default(0),

isActive: integer("is_active", { mode: "number" }).notNull().default(1),

// PostgreSQL equivalent needed
phoneNumberVerified: boolean("phone_number_verified")
  .notNull()
  .default(false),

isActive: boolean("is_active").notNull().default(true),
```

**Tables affected:** user, inventoryItemDefinition, userProfileHistory, plus all mapper functions converting `=== 1` checks.

#### 2. Timestamps as TEXT (MEDIUM PRIORITY)
```typescript
// Current: All timestamps stored as ISO strings
createdAt: text("created_at").notNull(),
updatedAt: text("updated_at").notNull(),

// PostgreSQL could use native timestamps
createdAt: timestamp("created_at").notNull().defaultNow(),
updatedAt: timestamp("updated_at").notNull().defaultNow(),
```

**Impact:** All timestamp comparisons use string comparison, which works but is less efficient. All mapper functions extract text values.

#### 3. Real vs Numeric for Money (HIGH PRIORITY)
```typescript
// Current: Using real for money values
salaryAmountDzd: real("salary_amount_dzd"),
currentBalance: real("current_balance").notNull().default(0),
grossTotalDzd: real("gross_total_dzd").notNull().default(0),

// PostgreSQL: Use NUMERIC for exact money representation
salaryAmountDzd: numeric("salary_amount_dzd", { precision: 15, scale: 2 }),
currentBalance: numeric("current_balance", { precision: 15, scale: 2 }).notNull().default('0'),
```

**Impact:** Floating-point precision issues exist in current SQLite implementation. PostgreSQL's `numeric` type is exact for financial calculations.

#### 4. Missing Database Features in SQLite Schema
- **No CHECK constraints** — status fields could benefit from PostgreSQL ENUMS or CHECK constraints
- **No generated columns** — computed fields like `currentBalance` could be generated
- **No partial indexes** — frequently queried filtered subsets could benefit

### SQLite-Specific Infrastructure Code

| File | Issue | Complexity |
|------|-------|------------|
| `factory.ts` | Direct `better-sqlite3` import, SQLCipher, WAL pragma | HIGH |
| `drizzle.ts` | `drizzle(better-sqlite3)` import | MEDIUM |
| `migration-runner.ts` | Uses `$executeRawUnsafe` (mostly portable) | LOW |
| `schema-definitions.ts` | Raw SQL definitions | HIGH |

### PostgreSQL Advantages

1. **Native boolean type** — cleaner queries, proper indexing
2. **Native timestamp with timezone** — better time handling
3. **NUMERIC type** — exact decimal for financial data
4. **JSON/JSONB** — flexible data without schema changes
5. **Partial indexes** — better query performance for filtered queries
6. **GENERATED columns** — computed fields at database level
7. **LISTEN/NOTIFY** — real-time updates for multi-user scenarios
8. **ACID with better concurrency** — proper row-level locking
9. **Enum types** — type-safe status values

---

## Part 3 — Multi-Database Readiness

### Current State Assessment

**Can the current architecture support SQLite → PostgreSQL without rewriting business logic?**

**Answer: NO — Not directly, but the distance is manageable.**

### Blockers Identified

#### Blocker 1: Infrastructure Layer (Effort: 3-5 days)
The entire database infrastructure is SQLite-specific:

```typescript
// factory.ts - Cannot be reused for PostgreSQL
import Database from "better-sqlite3"
// ...
const sqlite = new SqliteConstructor(databasePath)
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")
```

**Required changes:**
- Abstract database connection factory
- Create PostgreSQL connection pool
- Handle connection lifecycle differences

#### Blocker 2: Schema Definitions (Effort: 5-8 days)
Drizzle schemas use SQLite-specific column types:

```typescript
// Current
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

// Needed
import { pgTable, text, integer, real, boolean, numeric, timestamp } from "drizzle-orm/pg-core"
```

**Impact:** Every schema file needs modification or duplication.

#### Blocker 3: Repository Layer (Effort: 5-7 days)
Repositories import SQLite-specific Drizzle utilities:

```typescript
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

type DrizzleDb = BetterSQLite3Database<typeof schema>;
```

**Required changes:**
- Abstract database type
- Handle query differences (e.g., `sqlite` vs `pg` specific functions)

#### Blocker 4: Raw SQL Queries (Effort: 3-5 days)
Some repositories contain raw SQL:

```typescript
// Found in company.repository.ts
await tx.$executeRawUnsafe('INSERT INTO "app_schema_state"...')
```

**Required changes:**
- Parameterized queries need dialect-specific handling
- SQLite's `?` placeholders vs PostgreSQL's `$1, $2`

#### Blocker 5: Transaction Handling (Effort: 2-3 days)
SQLite uses file-level locking; PostgreSQL uses row-level locking.

```typescript
// Current: simple transaction wrapper
private withTransaction<T>(operation: () => T): T {
  return this.transactionManager.execute(operation);
}
```

**Impact:** Code will work, but performance characteristics change significantly.

### Migration Effort Estimate

| Component | Days | Risk |
|-----------|------|------|
| Infrastructure abstraction | 3-5 | HIGH |
| Schema adaptation | 5-8 | MEDIUM |
| Repository adaptation | 5-7 | MEDIUM |
| Raw SQL fixes | 3-5 | LOW |
| Transaction handling | 2-3 | LOW |
| Testing & validation | 5-7 | HIGH |
| Data migration tool | 5-8 | MEDIUM |
| **Total** | **28-43 days** | |

---

## Part 4 — Adapter Architecture

### Option A: Repository Pattern (Recommended)

```typescript
// Application Layer
interface CompanyRepository {
  listEmployees(filters?: EmployeeListFilters): EmployeeRecord[];
  getEmployeeById(id: string): EmployeeRecord | null;
  createEmployee(data: EmployeeCreateData): EmployeeRecord;
}

// SQLite Adapter
class SqliteCompanyRepository implements CompanyRepository {
  constructor(private db: BetterSqliteDatabase) {}
  // SQLite implementation
}

// PostgreSQL Adapter
class PostgresCompanyRepository implements CompanyRepository {
  constructor(private db: PgDatabase) {}
  // PostgreSQL implementation
}
```

**Pros:**
- Clean separation of concerns
- Easy to test (mock repository)
- Supports multiple implementations
- Follows existing patterns in codebase

**Cons:**
- Requires implementing each repository twice
- Risk of drift between implementations
- More code to maintain

### Option B: Database Abstraction Layer

```typescript
// Abstract database interface
interface DatabaseAdapter {
  query<T>(sql: string, params: any[]): Promise<T[]>;
  execute(sql: string, params: any[]): Promise<void>;
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;
}

// Single repository implementation using adapter
class SqliteAdapter implements DatabaseAdapter { /* ... */ }
class PostgresAdapter implements DatabaseAdapter { /* ... */ }
```

**Pros:**
- Single codebase for all queries
- Less code duplication
- Drizzle already provides this if used correctly

**Cons:**
- May lose query optimization opportunities
- Complex queries may need dialect-specific handling
- Drizzle already does this — reinventing the wheel

### Option C: Drizzle Multi-Dialect (Recommended Approach)

```typescript
// schema/company.ts - portable schema
import { pgTable, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core"

// OR

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

// repository.company.ts - abstracted repository
class CompanyRepository {
  constructor(private db: AnyDrizzleDatabase) {}
  // Uses Drizzle's query builder which handles dialect differences
}
```

**Pros:**
- Drizzle already supports multiple dialects
- Query builder handles most differences
- Minimal custom code needed

**Cons:**
- Need to maintain two schema files (or use conditional imports)
- Some advanced features are dialect-specific

### **Recommended Architecture**

**Hybrid of Options A and C:**

1. **Keep Drizzle as the query builder** — it already handles dialect differences
2. **Create separate schema files** for SQLite and PostgreSQL:
   - `schema/sqlite/*.ts` (current, enhanced)
   - `schema/postgres/*.ts` (new, using PostgreSQL types)
3. **Use abstract repository interfaces** with dialect-specific implementations where needed
4. **Share business logic** through services that depend on repository interfaces

**Implementation Plan:**

```
apps/api/src/
├── schema/
│   ├── sqlite/           # Current schema, enhanced
│   └── postgres/         # New PostgreSQL schema
├── repositories/
│   ├── company/
│   │   ├── company.repository.ts      # Interface
│   │   ├── company.sqlite.ts          # SQLite implementation
│   │   └── company.postgres.ts        # PostgreSQL implementation
│   └── index.ts           # Factory that returns correct implementation
├── modules/
│   └── company/
│       └── company.service.ts  # Uses repository interface (unchanged)
```

---

## Part 5 — Migration Strategy

### Migration Flow: SQLite → PostgreSQL

```text
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  SQLite Desktop │ ───> │ Migration Tool   │ ───> │ PostgreSQL      │
│  (local file)   │      │ (export/validate)│      │ (server)        │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Validation Report│
                         │ - integrity check│
                         │ - orphaned data  │
                         │ - audit trail    │
                         └──────────────────┘
```

### Migration Stages

#### Stage 1: Export from SQLite
```typescript
// Export all tables with full integrity
interface MigrationExport {
  version: string;
  exportedAt: string;
  sourceType: 'sqlite';
  tables: {
    users: UserRecord[];
    employees: EmployeeRecord[];
    projects: ProjectRecord[];
    // ... all tables
  };
  checksum: string;
}
```

#### Stage 2: Transform Data
- Convert integer booleans → native booleans
- Convert real money values → numeric strings (avoid precision loss)
- Convert ISO timestamps → proper timestamp objects
- Generate UUIDs for any missing IDs
- Validate referential integrity

#### Stage 3: Import to PostgreSQL
- Use bulk insert with proper transaction handling
- Maintain foreign key order (parents before children)
- Preserve audit trail timestamps
- Generate new checksum for verification

#### Stage 4: Validation
- Row count comparison per table
- Checksum verification for critical fields
- Referential integrity validation
- Business rule validation (balances, statuses)

### Critical Data to Preserve

| Data Type | Tables | Special Handling |
|-----------|--------|------------------|
| Users & Auth | user, session, account | Preserve IDs for session continuity |
| Employees | employee, employeeStateHistory | Salary history must be exact |
| Financial | debtAccount, debtEntry, employeeSalaryPayment | Numeric precision critical |
| Inventory | inventoryItemDefinition, inventoryAssetUnit | Audit trail preservation |
| Audit | *History tables | Actor context must be preserved |
| Files | inventoryInvoiceAttachment | File storage paths, SHA256 checksums |

### Rollback Strategy

1. **Pre-migration backup** — Copy SQLite file before migration
2. **Post-migration verification** — Run validation before cutting over
3. **Dual-write period** — Optional: write to both databases during transition
4. **Rollback command** — If issues detected, restore SQLite and revert

### Resumability

The migration tool should:
- Track progress per table
- Support resuming from last successful table
- Handle partial failures gracefully
- Provide detailed error logs

---

## Part 6 — Client/Server Separation

### Current Coupling Analysis

#### Tightly Coupled Code

| Component | Coupling Type | Impact |
|-----------|---------------|--------|
| `lib.rs` | Tauri commands directly call Node.js sidecar | HIGH |
| `dependencies.ts` | Manual wiring assumes single process | HIGH |
| `factory.ts` | Database path resolution is desktop-specific | HIGH |
| `desktop-api-bridge.ts` | Frontend assumes local API | MEDIUM |
| `runtime-config.ts` | API URL hardcoded to localhost | MEDIUM |

#### Shared Modules (Good)

| Module | Location | Sharing Status |
|--------|----------|----------------|
| Contracts | `packages/contracts` | ✅ Already shared |
| Drizzle schemas | `apps/api/src/schema` | ⚠️ Needs abstraction |
| Service logic | `apps/api/src/modules/*` | ⚠️ Mostly portable |

#### Networking Assumptions

```typescript
// Current: Hardcoded to localhost
const API_HOST = "127.0.0.1";
const API_PORT = 4318;

// Desktop API bridge assumes local connection
export async function desktopApiFetch(request: Request, init?: {...}) {
  // Always connects to local sidecar
}
```

#### Filesystem Assumptions

```typescript
// factory.ts - Desktop-specific path resolution
function resolveDatabaseEnv() {
  // Assumes relative paths from app binary
  return { databasePath: path.join(appDir, 'projects/default/tuari.sqlite') }
}
```

### Required Architectural Changes

#### 1. Configuration Layer

```typescript
// New: Environment-aware configuration
interface AppConfig {
  mode: 'desktop' | 'client-server';
  database: {
    type: 'sqlite' | 'postgresql';
    url?: string;  // For PostgreSQL
    path?: string; // For SQLite
  };
  auth: {
    type: 'local' | 'remote';
    serverUrl?: string;
  };
  api: {
    baseUrl: string;
    timeout: number;
  };
}
```

#### 2. API Client Abstraction

```typescript
// Current: Desktop-specific bridge
import { desktopApiFetch } from '@/lib/desktop-api-bridge'

// New: Universal API client
interface ApiClient {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

class DesktopApiClient implements ApiClient {
  // Uses Tauri command bridge
}

class RemoteApiClient implements ApiClient {
  // Uses standard HTTP with auth headers
}
```

#### 3. Server Process Management

```typescript
// Current: Tauri manages sidecar
// New: Abstract process manager
interface ProcessManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

class DesktopProcessManager implements ProcessManager {
  // Tauri sidecar management
}

class ServerProcessManager implements ProcessManager {
  // PM2/systemd/external process management
}
```

### Evolution Path

**Phase 1: Desktop (Current)**
```
Tauri → Sidecar API → SQLite
```

**Phase 2: Client/Server**
```
Tauri/Web → Remote API → PostgreSQL
                 ↑
            Tailscale/VPN
```

**Phase 3: Hybrid**
```
Desktop → Local SQLite (offline)
           ↓ sync
       Remote PostgreSQL (online)
```

---

## Part 7 — Effect Evaluation

### Assessment: Effect Framework

**Recommendation: DO NOT ADOPT EFFECT at this time.**

### Analysis by Use Case

#### 1. Async Orchestration
**Current State:** Simple promise chains, no complex orchestration.

```typescript
// Current pattern (company.service.ts)
async createEmployee(input: EmployeeCreateInput) {
  const validated = this.validateInput(input);
  const audit = this.createMutationAuditContext();
  const result = await this.repository.createEmployee(validated, audit);
  return successResult("Employee created", result);
}
```

**Effect Solution:**
```typescript
pipe(
  validateInput(input),
  Effect.flatMap(createAuditContext),
  Effect.flatMap(repository.createEmployee),
  Effect.map(result => successResult("Employee created", result))
)
```

**Assessment:** Current approach is clearer. Effect adds abstraction without benefit.

#### 2. Error Handling
**Current State:** Custom error classes with typed error codes.

```typescript
// Current pattern
class CompanyError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'UNAUTHORIZED',
    message: string,
    public readonly details?: any
  ) { super(message); }
}
```

**Effect Solution:**
```typescript
// Effect would model errors as values
type CompanyError = NotFound | Validation | Unauthorized;
const createEmployee = (input: EmployeeCreateInput) =>
  pipe(
    validateInput(input),
    Effect.catchTags({
      ValidationError: handleValidation,
    })
  )
```

**Assessment:** Current approach is simpler and already well-integrated.

#### 3. Dependency Injection
**Current State:** Manual constructor injection via `createAppDependencies()`.

```typescript
// Current pattern
const companyRepository = createCompanyRepository(sharedDatabase);
const companyService = new CompanyService(companyRepository);
```

**Effect Solution:**
```typescript
const CompanyService = Effect.Service.Tag<'CompanyService'>()
const program = pipe(
  CompanyService,
  Effect.flatMap(service => service.createEmployee(input))
)
```

**Assessment:** Manual DI works fine for this scale. Effect's DI is overkill.

#### 4. Retry Logic
**Current State:** No retry logic (local-first app doesn't need it).

**Client/Server Future:** Will need retries for network calls.

**Recommendation:** Add retry logic only when implementing client/server mode. Use simple exponential backoff — not Effect.

#### 5. Scheduling
**Current State:** No background jobs (single-user desktop app).

**Assessment:** Not needed now. When needed, use simple `setInterval` or a job queue library.

### Where Effect COULD Help (But Not Worth It)

| Use Case | Current State | Effect Benefit | Recommendation |
|----------|---------------|----------------|----------------|
| Database transactions | Manual TransactionManager | Transaction composition | Keep current |
| Error accumulation | Throwing on first error | Validate all fields, return all errors | Consider for forms |
| Real-time updates | None | Not needed | Add when needed |

### Alternative to Effect

For the specific challenges identified:

1. **Error accumulation for form validation:**
```typescript
// Simple Result type (no Effect needed)
type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E[] };

function validateEmployeeForm(input: unknown): Result<ValidatedEmployee, ValidationError[]> {
  const errors: ValidationError[] = [];
  if (!input.name) errors.push({ field: 'name', message: 'Required' });
  // ... collect all errors
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: validated };
}
```

2. **Retry logic for network calls:**
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; backoff: number }
): Promise<T> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === options.maxAttempts - 1) throw error;
      await sleep(options.backoff * Math.pow(2, attempt));
    }
  }
  throw new Error('Unreachable');
}
```

3. **Transaction composition:**
```typescript
// Already works well with current TransactionManager
transactionManager.execute(() => {
  const employee = repository.createEmployee(data);
  const history = repository.createStateHistory({...});
  return { employee, history };
});
```

### **Final Verdict on Effect**

| Factor | Score | Notes |
|--------|-------|-------|
| Current pain points | 1/10 | No significant async complexity |
| Learning curve cost | 8/10 | Team needs to learn Effect paradigm |
| Maintenance burden | 7/10 | Effect requires ongoing expertise |
| Code clarity | 6/10 | Effect adds abstraction layers |
| **Recommendation** | **DO NOT ADOPT** | |

**When to revisit:** If the codebase evolves to have:
- Complex multi-step workflows with error recovery
- Multiple async operations with complex dependencies
- Need for distributed transactions across services
- Requirement for compile-time guaranteed error handling

---

## Part 8 — Future Features

### Analysis of Planned Work

Based on the `REDESIGN_TASKS.md` and codebase analysis:

#### Phase 1-2: Design System & Shell (UI Only)
**Impact on Architecture:** None
- CSS/styling changes only
- Component restructuring
- No database or API changes

#### Phase 3: Shared Page Primitives
**Impact on Architecture:** None
- UI component library
- No backend changes

#### Phase 4: Missing Pages
**Impact on Architecture:** Minimal
- Invoice details page — reads existing data
- Transfer dialog — uses existing mutations
- Salary payment dialog — uses existing mutations

**Current mutations already exist:**
- `useTransferInventoryAssetMutation`
- `useTransferInventoryConsumableMutation`
- `useCreateSalaryPaymentMutation`

#### Phase 5: Page Redesigns
**Impact on Architecture:** None
- Visual redesign of existing functionality
- No new business logic

#### Phase 6: Polish & RTL
**Impact on Architecture:** None
- CSS/i18n fixes only

### Upcoming Features That Would Change Architecture

| Feature | Architectural Impact | Priority |
|---------|---------------------|----------|
| Multi-user support | HIGH — needs PostgreSQL, auth changes | Not in current backlog |
| Cloud sync | HIGH — needs conflict resolution, sync protocol | Not in current backlog |
| Plugin system | MEDIUM — needs dependency injection, isolation | Not in current backlog |
| API for mobile apps | MEDIUM — needs proper API versioning | Not in current backlog |

### Assessment

**The current planned work is purely UI/design focused.**

No architectural changes are needed for the redesign tasks. The database and API layers remain stable.

**Future consideration:** The redesign spec mentions an "Analytics Page" which may eventually need:
- Aggregate queries (performance considerations)
- Caching layer (if queries become slow)
- Possibly read replicas (for PostgreSQL)

---

## Part 9 — Risks

### Risk Assessment Matrix

| Rank | Risk | Severity | Likelihood | Impact | Mitigation |
|------|------|----------|------------|--------|------------|
| 1 | SQLite to PostgreSQL migration breaks data | HIGH | MEDIUM | Critical | Comprehensive migration tool with validation |
| 2 | Services too large for maintainability | HIGH | HIGH | High | Refactor into domain modules |
| 3 | No integration tests for database layer | HIGH | HIGH | High | Add repository integration tests |
| 4 | Integer boolean confusion causes bugs | MEDIUM | HIGH | Medium | Standardize on boolean type |
| 5 | Money precision loss in SQLite | MEDIUM | MEDIUM | Medium | Use NUMERIC in PostgreSQL, audit SQLite values |
| 6 | Desktop/server code divergence | MEDIUM | MEDIUM | Medium | Shared contracts + integration tests |
| 7 | Tauri coupling prevents server deployment | LOW | LOW | Medium | Already partially addressed by API separation |
| 8 | Authentication differences between modes | LOW | LOW | Medium | Abstract auth provider |
| 9 | File storage path assumptions | LOW | MEDIUM | Low | Configuration-based paths |
| 10 | Testing overhead increases | LOW | MEDIUM | Low | Repository mock pattern |

### Detailed Risk Analysis

#### Risk 1: Migration Data Loss (Severity: HIGH)

**Problem:** SQLite → PostgreSQL migration could lose or corrupt data.

**Scenarios:**
- Integer boolean conversion errors
- Money precision loss during real → numeric conversion
- Timestamp timezone handling differences
- Foreign key constraint violations
- Orphaned audit records

**Mitigation:**
1. Build comprehensive migration tool BEFORE client/server mode
2. Mandatory pre-migration validation
3. Post-migration checksum verification
4. Rollback capability
5. Beta testing with real customer data

#### Risk 2: Service Size (Severity: HIGH)

**Problem:** `company.service.ts` is 88KB with 2000+ lines.

**Impact:**
- Hard to understand and maintain
- Difficult to test individual features
- Merge conflicts likely
- Cognitive overload for developers

**Mitigation:**
1. Split into domain-specific services:
   - `employee.service.ts`
   - `project.service.ts`
   - `warehouse.service.ts`
   - `debt.service.ts`
2. Extract common patterns into shared utilities
3. Use facade pattern for backward compatibility

#### Risk 3: Insufficient Testing (Severity: HIGH)

**Problem:** No repository integration tests exist.

**Impact:**
- Database bugs discovered in production
- Migration issues not caught early
- Regression risk during refactoring

**Mitigation:**
1. Add repository integration tests using test SQLite database
2. Test migrations against real databases
3. Add contract tests for API endpoints

#### Risk 4: Money Precision (Severity: MEDIUM)

**Problem:** Using `real` (float) for monetary values.

**Impact:**
- Rounding errors accumulate
- Financial reports may be inaccurate
- PostgreSQL migration requires careful value conversion

**Mitigation:**
1. Audit current data for precision issues
2. Use `numeric` type in PostgreSQL
3. Consider integer cents for SQLite (breaking change)

---

## Part 10 — Final Recommendations

### Prioritized Roadmap

#### Priority 1: Prepare for Multi-Database (3-4 months)

**Problem:** Current architecture is tightly coupled to SQLite.

**Impact:** Enables future client/server mode without rewrite.

**Urgency:** Medium — No immediate need, but foundation must be laid early.

**Implementation Complexity:** Medium-High

**Engineering Effort:** 28-43 days

**Expected Payoff:** 
- Enables PostgreSQL deployment
- Improves code testability
- Reduces SQLite-specific bugs

**Tasks:**
1. Create abstract database connection interface
2. Separate SQLite and PostgreSQL schemas
3. Abstract repository interfaces
4. Build migration validation tool
5. Add repository integration tests

---

#### Priority 2: Service Decomposition (2-3 months)

**Problem:** `company.service.ts` is 88KB, handling all domain logic.

**Impact:** Maintainability, testability, developer experience.

**Urgency:** High — Affects daily development velocity.

**Implementation Complexity:** Medium

**Engineering Effort:** 15-20 days

**Expected Payoff:**
- Easier to understand and modify
- Faster onboarding for new developers
- Reduced merge conflicts

**Tasks:**
1. Extract `employee.service.ts`
2. Extract `project.service.ts`
3. Extract `warehouse.service.ts`
4. Extract `debt.service.ts`
5. Create `CompanyService` facade for backward compatibility

---

#### Priority 3: Testing Infrastructure (1-2 months)

**Problem:** No repository integration tests.

**Impact:** Catches bugs early, enables safe refactoring.

**Urgency:** High — Critical for database migration work.

**Implementation Complexity:** Low-Medium

**Engineering Effort:** 10-15 days

**Expected Payoff:**
- Confidence in database changes
- Faster debugging
- Safer migrations

**Tasks:**
1. Set up test database fixtures
2. Write repository integration tests
3. Add migration test suite
4. Create test helpers for common patterns

---

#### Priority 4: Configuration Abstraction (1 month)

**Problem:** Hardcoded desktop-specific configurations.

**Impact:** Enables server deployment mode.

**Urgency:** Low — Only needed when implementing client/server.

**Implementation Complexity:** Low

**Engineering Effort:** 5-8 days

**Expected Payoff:**
- Single codebase for desktop and server
- Easier environment-specific debugging
- Foundation for future deployment modes

**Tasks:**
1. Create `AppConfig` interface
2. Extract hardcoded values to configuration
3. Add environment detection
4. Create configuration loaders for each mode

---

#### Priority 5: Client/Server Mode (3-4 months)

**Problem:** No remote access capability.

**Impact:** Multi-user access, central data storage.

**Urgency:** Low — Not in current product vision yet.

**Implementation Complexity:** High

**Engineering Effort:** 50-70 days

**Expected Payoff:**
- Multi-user support
- Centralized data management
- Team collaboration

**Tasks:**
1. Implement PostgreSQL adapter
2. Add network authentication
3. Create API client abstraction
4. Build connection management
5. Add offline/online sync (if needed)

---

### Architecture Decision Records (ADRs)

Based on this review, the following ADRs are recommended:

#### ADR-001: Database Adapter Pattern
- **Decision:** Use Drizzle's multi-dialect support with separate schema files
- **Rationale:** Leverages existing Drizzle investment, minimal code duplication
- **Status:** Recommended for implementation

#### ADR-002: Service Decomposition
- **Decision:** Split monolithic services into domain-specific services
- **Rationale:** Improve maintainability, enable independent testing
- **Status:** Recommended for immediate implementation

#### ADR-003: Repository Interface Pattern
- **Decision:** Define repository interfaces, implement dialect-specific versions
- **Rationale:** Enables database migration without service changes
- **Status:** Recommended for multi-database preparation

#### ADR-004: Effect Framework
- **Decision:** Do not adopt Effect at this time
- **Rationale:** Current complexity doesn't justify learning curve and abstraction overhead
- **Status:** Final — Revisit if async complexity increases significantly

#### ADR-005: Migration Tool
- **Decision:** Build comprehensive migration tool before client/server mode
- **Rationale:** Data integrity is critical for customer trust
- **Status:** Recommended for implementation alongside database adapter work

---

### Summary

**Tuari has a solid foundation** with clean contract separation, proper auth, and good type safety through oRPC. The main architectural debt is **SQLite coupling** and **service size**.

**The recommended path forward:**
1. **Short-term (1-3 months):** Service decomposition + testing infrastructure
2. **Medium-term (3-6 months):** Database adapter pattern + migration tool
3. **Long-term (6-12 months):** Client/server mode (when product vision requires it)

**Do NOT:**
- Adopt Effect framework now
- Prematurely optimize for PostgreSQL before SQLite works perfectly
- Build client/server mode before the product requires it

**DO:**
- Invest in testing infrastructure
- Decompose monolithic services
- Build database adapter pattern
- Create comprehensive migration tool

This approach provides the **simplest architecture capable of supporting the long-term product vision** while maintaining the local-first, offline-capable nature that makes Tuari valuable.
