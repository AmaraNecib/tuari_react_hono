# Refactoring Roadmap - Tuari v1.0.0+

**Based on:** Ultraplan Code Review (May 3, 2026)  
**Current Score:** 6.5/10 → **Target:** 8.5/10  
**Total Estimated Time:** 14-16 days  
**Status:** Not Started

---

## Overview

This document tracks all refactoring work organized by phase and priority. Use this to track progress across the project.

### How to Use

1. **Start with Phase 1** - All critical issues
2. **Mark tasks as you work** - Update status in task management (`/tasks`)
3. **Complete Phase 1 before Phase 2** - Phase 2 depends on Phase 1 completion
4. **Phase 3 is optional** - Skip if time-constrained
5. **Update this document** - Mark phases as complete

---

## PHASE 1: Critical Issues - Refactoring Foundation

**Status:** ⏳ Not Started  
**Estimated:** 7-8 days  
**Blocker:** None (starts immediately)  
**Blocks:** Phase 2

### Overview

Fix the most critical architectural issues that block scalability:
- Split God Objects (CompanyService 1774 LOC, CompanyRepository 1746 LOC)
- Implement pagination on all list endpoints
- Centralize input validation middleware
- Add structured logging & observability

### Task 1.1: Split CompanyService God Object

**Status:** ⏳ Pending  
**Estimated:** 16 hours  
**Depends On:** None  
**Blocks:** 1.2, Phase 2

**Goal:** Split 1774-line CompanyService into domain-specific services

**Work Items:**
- [ ] Create `apps/api/src/modules/workforce/workforce.service.ts`
  - Move: listEmployees, createEmployee, getRole, createRole, listExternalCounterparties, createExternalCounterparty
  - Move: All employee assignment methods (3+)
  - Move: All salary payment methods (4+)
  - Target size: <350 LOC

- [ ] Create `apps/api/src/modules/finance/finance.service.ts`
  - Move: listDebtAccounts, createDebtAccount, getDebtAccount
  - Move: listDebtEntries, createDebtEntry, settleDebtAccount
  - Move: getDebtPartyDetail
  - Target size: <350 LOC

- [ ] Create `apps/api/src/modules/operations/operations.service.ts`
  - Move: listProjects, createProject, updateProject, deleteProject
  - Move: All project assignment methods (3+)
  - Move: listWarehouses, createWarehouse, updateWarehouse
  - Move: All warehouse assignment methods (3+)
  - Target size: <400 LOC

- [ ] Update `apps/api/src/modules/company/company.service.ts`
  - Keep as orchestration facade
  - Inject new services
  - Target size: <300 LOC

- [ ] Update all RPC handlers
  - `apps/api/src/rpc/handlers/workforce.ts` → use WorkforceService
  - `apps/api/src/rpc/handlers/finance.ts` → use FinanceService
  - `apps/api/src/rpc/handlers/operations.ts` → use OperationsService

- [ ] Update tests
  - Create tests for each new service
  - Verify all methods work independently

**Verification:**
- ✓ Each service <500 LOC
- ✓ `npm run typecheck` passes
- ✓ All tests pass
- ✓ No regressions in RPC handlers

---

### Task 1.2: Split CompanyRepository God Object

**Status:** ⏳ Pending  
**Estimated:** 14 hours  
**Depends On:** 1.1  
**Blocks:** Phase 2

**Goal:** Split 1746-line CompanyRepository into domain repositories

**Work Items:**
- [ ] Create `apps/api/src/modules/workforce/employee.repository.ts`
  - Implement: listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee
  - Include eager loading: role, assignments
  - Target size: <150 LOC

- [ ] Create `apps/api/src/modules/workforce/role.repository.ts`
  - Implement: listRoles, getRole, createRole, updateRole, deleteRole
  - Target size: <80 LOC

- [ ] Create `apps/api/src/modules/workforce/external-counterparty.repository.ts`
  - Implement: list, get, create, update, delete
  - Target size: <100 LOC

- [ ] Create `apps/api/src/modules/finance/debt.repository.ts`
  - Implement: listDebtAccounts, getDebtAccount, createDebtAccount, updateDebtAccount
  - Implement: listDebtEntries, createDebtEntry
  - Include eager loading: account, entries
  - Target size: <200 LOC

- [ ] Create `apps/api/src/modules/operations/project.repository.ts`
  - Implement: listProjects, getProject, createProject, updateProject, deleteProject
  - Include eager loading: assignments, manager
  - Target size: <150 LOC

- [ ] Create `apps/api/src/modules/operations/warehouse.repository.ts`
  - Implement: listWarehouses, getWarehouse, createWarehouse, updateWarehouse
  - Include eager loading: assignments, manager
  - Target size: <150 LOC

- [ ] Update `apps/api/src/modules/company/company.repository.ts`
  - Become a facade that composes all domain repositories
  - Maintain backward compatibility
  - Target size: <200 LOC

- [ ] Update all services to use new repositories
  - WorkforceService uses EmployeeRepository, RoleRepository
  - FinanceService uses DebtRepository
  - OperationsService uses ProjectRepository, WarehouseRepository

- [ ] Add eager loading to all repository methods
  - Employee: include role, assignments
  - Project: include assignments, manager
  - Warehouse: include assignments, manager
  - Debt: include entries

**Verification:**
- ✓ Each repository <300 LOC
- ✓ All queries have proper `.include()` statements
- ✓ No N+1 query patterns detected
- ✓ `npm run typecheck` passes
- ✓ All tests pass

---

### Task 1.3: Implement Pagination on All List Endpoints

**Status:** ⏳ Pending  
**Estimated:** 12 hours  
**Depends On:** 1.2  
**Blocks:** Phase 2

**Goal:** Add pagination to all 20+ list endpoints to prevent data overload

**Work Items:**
- [ ] Create pagination schema
  - File: `packages/contracts/src/pagination.ts` (NEW)
  - Define: `paginationInputSchema` (limit, offset, sortBy, sortOrder)
  - Define: `paginatedSchema<T>` wrapper (items, total, hasMore, offset, limit)
  - Constraints: limit 1-100 (default 20), offset 0+

- [ ] Update all RPC router endpoints
  - File: `apps/api/src/rpc/router.ts`
  - 20+ endpoints to update:
    - employeesList, rolesList, externalCounterpartiesList
    - projectsList, warehousesList
    - debtAccountsList, debtEntriesList
    - employeeStateHistoryList, projectAssignmentsList, warehouseAssignmentsList
    - managersList, salaryPaymentsList, systemLogList
  - Each takes `paginationInputSchema`
  - Each returns `paginatedSchema<T>`

- [ ] Update all repository list methods
  - Add `pagination?: { limit: number; offset: number }` parameter
  - Implement with Prisma `take` and `skip`
  - Return `{ items, total, hasMore, offset, limit }`
  - Example:
    ```typescript
    async listEmployees(
      filters?: EmployeeListFilters,
      pagination?: { limit: number; offset: number }
    ) {
      const [items, total] = await Promise.all([
        this.db.employee.findMany({
          where: buildFilters(filters),
          take: pagination?.limit ?? 20,
          skip: pagination?.offset ?? 0,
          orderBy: { createdAt: 'desc' },
        }),
        this.db.employee.count({ where: buildFilters(filters) }),
      ]);
      return { items, total, hasMore: (pagination?.offset ?? 0) + items.length < total, ... };
    }
    ```

- [ ] Update web queries
  - File: `apps/web/src/features/app-shell/workspace-queries.ts`
  - Convert to page-based pagination
  - Example:
    ```typescript
    export const useEmployeesList = (page = 0) => {
      return useQuery({
        queryKey: ['employees', page],
        queryFn: () => rpcClient.employeesList({
          limit: 20,
          offset: page * 20,
        }),
      });
    };
    ```

- [ ] Update UI components to handle pagination
  - Add "Load More" button or pagination controls
  - Show "X of Y items"
  - Handle hasMore flag

**Verification:**
- ✓ All list endpoints return paginated data
- ✓ `npm run typecheck` passes
- ✓ Frontend correctly handles pagination
- ✓ All tests pass
- ✓ Large datasets load without crashing

---

### Task 1.4: Add Structured Logging & Observability Middleware

**Status:** ⏳ Pending  
**Estimated:** 8 hours  
**Depends On:** 1.1  
**Blocks:** Phase 2

**Goal:** Add comprehensive request/response logging and audit trails

**Work Items:**
- [ ] Create logging middleware
  - File: `apps/api/src/infrastructure/logging/logging-middleware.ts` (NEW)
  - Log on request start:
    - requestId (unique per request)
    - handlerName
    - userId
    - IP address
    - timestamp
  - Log on request end:
    - requestId
    - duration (ms)
    - success/error
    - error message if applicable
  - Use structured JSON format
  - Example:
    ```typescript
    logger.info('rpc_request_started', {
      requestId: '123e-456f',
      handlerName: 'employeeCreate',
      userId: 'user-789',
      timestamp: '2026-05-03T10:00:00Z',
    });
    ```

- [ ] Create audit logger for sensitive operations
  - File: `apps/api/src/modules/company/audit-logger.ts` (NEW)
  - Log: operation (create/update/delete), entity, entityId, actor, changes
  - Store in systemLog table
  - Sensitive operations: create/update/delete of employees, projects, debt accounts
  - Example:
    ```typescript
    await auditLogger.logOperation('create', 'Employee', empId, actor, {
      name: emp.name,
      email: emp.email,
    });
    ```

- [ ] Verify input validation middleware
  - File: `apps/api/src/rpc/rpc-middleware.ts` + contracts schemas
  - Confirm: the ORPC contract wire gate is the single validation authority
    (`implement(appContract)` input schemas → `BAD_REQUEST` + `data.issues`)
  - Confirm: validation errors carry zod field paths + messages (`data.issues`)
  - Confirm: no manual double validation remains (removed in #278)

- [ ] Create validation documentation
  - File: `apps/api/src/infrastructure/validation/README.md` (NEW)
  - Document: Schema locations
  - Document: Error response format
  - Document: Field-level error handling
  - Example: Where each domain's schemas live

- [ ] Integrate logging into router
  - Wrap all handlers with logging middleware
  - Attach requestId to response headers
  - Ensure errors are logged before returning to client

**Verification:**
- ✓ All RPC requests logged with requestId
- ✓ Error messages include error code + details
- ✓ Audit log captures create/update/delete operations
- ✓ No PII or secrets in logs
- ✓ Logs are valid JSON (parseable)
- ✓ `npm run typecheck` passes

---

## PHASE 2: High Priority Issues - Query & Error Handling

**Status:** ⏳ Not Started  
**Estimated:** 4-5 days  
**Depends On:** Phase 1 complete  
**Blocks:** Phase 3

### Overview

Fix database efficiency and error handling:
- Eliminate N+1 queries with eager loading
- Implement transaction boundaries for multi-step operations
- Create error hierarchy with retry information
- Add database indexes on key fields

---

### Task 2.1: Audit N+1 Queries & Add Eager Loading

**Status:** ⏳ Pending  
**Estimated:** 8 hours  
**Depends On:** 1.2  
**Blocks:** 2.4

**Goal:** Fix database efficiency by eager-loading relationships

**Work Items:**
- [ ] Audit all findMany calls
  - Search: `apps/api/src/modules/*/repository.ts`
  - Identify relationships that are accessed later
  - Example: If code accesses `employee.role.name`, role must be included

- [ ] Add Prisma include statements
  - Employee queries: include `{ role: true, assignments: true }`
  - Project queries: include `{ assignments: true, manager: true }`
  - Warehouse queries: include `{ assignments: true, manager: true }`
  - Debt queries: include `{ entries: true, party: true }`
  - Example:
    ```typescript
    const employees = await db.employee.findMany({
      include: { role: true, assignments: { include: { project: true } } },
      where: { status: 'ACTIVE' },
    });
    ```

- [ ] Enable Prisma query logging in tests
  - Test environment: log all DB queries
  - Verify each operation executes expected number of queries
  - List operations should be 1-2 queries max, not 1+N

- [ ] Create N+1 query test cases
  - Load 10 employees, verify 2 queries (not 11)
  - Load projects with assignments, verify 2-3 queries
  - Ensure eager loading is working

- [ ] Document eager-loading strategy
  - Which relationships are always included
  - Which are optional (controlled by query parameter)
  - Performance expectations

**Verification:**
- ✓ All list endpoints: 1-2 DB queries regardless of result size
- ✓ No accessed relationships missing from include
- ✓ Performance tests with 10k+ records show <500ms queries
- ✓ Prisma logs show no N+1 patterns
- ✓ All tests pass

---

### Task 2.2: Implement Transaction Management for Multi-Step Ops

**Status:** ⏳ Pending  
**Estimated:** 6 hours  
**Depends On:** 1.1  
**Blocks:** None

**Goal:** Ensure data consistency for multi-step mutations (create → validate → log)

**Work Items:**
- [x] Verify transaction composition exists (folded in #215)
  - File: `apps/api/src/modules/company/workspace-mutation-context.ts`
  - Understand: Transaction semantics, rollback behavior (`WorkspaceMutationContext.withTransaction` → `repository.withTransaction`; `TransactionManager` was removed in #215)

- [ ] Identify all multi-step operations
  - Create debt account → create opening entry → log to system
  - Create employee → assign to project → create salary payment
  - Create warehouse → assign manager → log assignment
  - Update project → update assignments → log change
  - List: 5-10 operations that need transactions

- [ ] Wrap all multi-step operations
  - Use `WorkspaceMutationContext.withTransaction` (sync callback — the
    `withTransaction` contract is synchronous, like better-sqlite3's)
  - All steps succeed together or all rollback
  - Updates: finance.service.ts, workforce.service.ts, operations.service.ts
  - Example:
    ```typescript
    return this.mutation.withTransaction(() => {
      const account = this.createDebtAccount(...);
      this.createOpeningEntry({ accountId: account.id, ... });
      this.logToSystem('DEBT_ACCOUNT_CREATED', { accountId: account.id });
      return account; // All succeed together
    });
    ```

- [ ] Add transaction tests
  - Test: Rollback when step N fails
  - Test: Verify no orphaned records created
  - Test: Concurrent transactions don't conflict
  - Example:
    ```typescript
    it('should rollback all changes if entry creation fails', async () => {
      jest.spyOn(repository, 'createDebtEntry').mockRejectedValueOnce(new Error('DB error'));
      await expect(service.createDebtAccount(...)).rejects.toThrow();
      const account = await repository.getDebtAccount(accountId);
      expect(account).toBeNull(); // Rolled back
    });
    ```

**Verification:**
- ✓ All multi-step mutations wrapped in transactions
- ✓ Transaction tests pass (rollback verified)
- ✓ Concurrent operations don't cause conflicts
- ✓ No orphaned records on failure
- ✓ All tests pass

---

### Task 2.3: Create Error Hierarchy with Retry Information

**Status:** ⏳ Pending  
**Estimated:** 8 hours  
**Depends On:** 1.4  
**Blocks:** None

**Goal:** Implement structured error handling so clients know what to do

**Work Items:**
- [ ] Create error hierarchy
  - File: `apps/api/src/infrastructure/errors/app-errors.ts` (NEW)
  - Base class: `AppError(code, statusCode, message, retryable)`
  - Subclasses:
    - `ValidationError(fieldErrors, retryable?)` → 400
    - `NotFoundError(message)` → 404
    - `ConflictError(message)` → 409, retryable
    - `RateLimitError(retryAfterSeconds)` → 429, retryable
    - `DatabaseError(message)` → 500, retryable
    - `UnauthorizedError(message)` → 401
  - Example:
    ```typescript
    export class AppError extends Error {
      constructor(
        public code: string,
        public statusCode: number,
        message: string,
        public retryable: boolean = false,
      ) { super(message); }
    }
    ```

- [ ] Update error response format
  - File: `apps/api/src/rpc/response-builders.ts`
  - Return: `{ code, message, statusCode, retryable, retryAfterSeconds?, fieldErrors? }`
  - Example:
    ```typescript
    {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        statusCode: 400,
        retryable: false,
        fieldErrors: { email: 'Invalid email format' }
      }
    }
    ```

- [ ] Update all handlers to use error types
  - Replace generic errors with specific types
  - Use NotFoundError for 404s
  - Use ConflictError for business logic conflicts
  - Use ValidationError with field details
  - Example in finance.service.ts:
    ```typescript
    if (!role) throw new NotFoundError(`Role ${id} not found`);
    if (exists) throw new ConflictError('Account already exists');
    if (!isValid) throw new ValidationError({ field: 'error' });
    ```

- [ ] Test error handling
  - Each error type returns correct status code
  - Retryable flag is accurate
  - Client can parse and act on errors
  - Test cases:
    - NotFoundError returns 404 with retryable: false
    - ConflictError returns 409 with retryable: true
    - ValidationError returns 400 with fieldErrors

**Verification:**
- ✓ All error codes documented
- ✓ All handlers use proper error types
- ✓ Error responses consistent across API
- ✓ Client tests can mock specific error types
- ✓ All tests pass

---

### Task 2.4: Add Database Indexes on Key Fields

**Status:** ⏳ Pending  
**Estimated:** 4 hours  
**Depends On:** 1.3  
**Blocks:** None

**Goal:** Improve query performance with strategic database indexes

**Work Items:**
- [ ] Identify commonly filtered fields
  - status (where status = 'ACTIVE')
  - roleId (foreign key joins)
  - createdAt (time-based filtering/sorting)
  - userId (access control)
  - Search all: `grep -r "where.*status\|where.*roleId" apps/api/src/modules`

- [ ] Add indexes to Prisma schema
  - File: `apps/api/src/infrastructure/database/prisma/schema.prisma`
  - Add single-column indexes: `@index`
  - Add composite indexes: `@@index([...])`
  - Example:
    ```prisma
    model Employee {
      status String @db.VarChar(50) @index
      roleId String @index
      createdAt DateTime @index
      @@index([status, createdAt])
      @@index([roleId, status])
    }
    ```

- [ ] Add indexes to models
  - Employee: status, roleId, createdAt, (status, createdAt)
  - Project: status, createdAt, managerId
  - Warehouse: status, createdAt, managerId
  - DebtAccount: status, createdAt, partyId
  - InventoryItem: status, createdAt, warehouseId

- [ ] Create and run migration
  ```bash
  pnpm --filter=@tuari/api prisma migrate dev --name add_indexes
  ```
  - Verify migration succeeds
  - Verify schema is correct

- [ ] Verify indexes are being used
  - Run queries in test environment
  - Check query performance improves
  - No errors on schema changes

**Verification:**
- ✓ All frequently-queried fields have indexes
- ✓ Migration runs without errors
- ✓ Query performance <100ms on 10k+ records
- ✓ No unused indexes (index bloat)
- ✓ Database schema is consistent

---

## PHASE 3: Medium Priority Issues - Features & Polish

**Status:** ⏳ Not Started  
**Estimated:** 3-4 days  
**Depends On:** Phase 2 complete  
**Optional:** Yes (can skip if time-constrained)

### Overview

Add advanced features and polish:
- Implement API versioning for safe evolution
- Add Redis caching for expensive queries
- Fix fragile cache invalidation with domain events
- Performance testing at scale

---

### Task 3.1: Implement API Versioning

**Status:** ⏳ Pending  
**Estimated:** 3 hours  
**Depends On:** Phase 2 complete  
**Blocks:** None

**Goal:** Enable safe API evolution without breaking clients

**Work Items:**
- [ ] Update router to support versions
  - File: `apps/api/src/rpc/router.ts`
  - Accept version parameter (default 'v1')
  - Prefix all routes with `/api/{version}/`
  - Example:
    ```typescript
    export function createRouter(deps, version: string = 'v1') {
      return createOrpcRouter({
        prefix: `/api/${version}`,
        handlers: {...},
      });
    }
    ```

- [ ] Register versioned routers
  - File: `apps/api/src/app/create-app.ts`
  - Mount v1 router at `/api/v1`
  - Future: Mount v2 at `/api/v2` when breaking changes needed
  - Example:
    ```typescript
    app.use('/api/v1', createRouter(deps, 'v1'));
    // app.use('/api/v2', createRouter(deps, 'v2')); // Future
    ```

- [ ] Update client to use versioned URLs
  - File: `apps/web/src/features/app-shell/rpc-client.ts`
  - Point to `/api/v1` by default
  - Environment variable to override version
  - Example: `API_VERSION=v1` in .env

- [ ] Document versioning strategy
  - Create: `docs/API_VERSIONING.md`
  - Document: When to create new version (breaking changes only)
  - Document: How to maintain multiple versions
  - Document: Deprecation timeline (e.g., support v1 for 6 months)

**Verification:**
- ✓ API endpoints work at `/api/v1/...`
- ✓ Future version can be added at `/api/v2/...` without breaking v1
- ✓ Client uses correct versioned endpoint
- ✓ Documentation shows versioning approach

---

### Task 3.2: Add Redis Caching for Expensive Queries

**Status:** ⏳ Pending  
**Estimated:** 6 hours  
**Depends On:** Phase 2 complete  
**Blocks:** None

**Goal:** Reduce database load for repeated expensive queries

**Work Items:**
- [ ] Set up Redis client
  - File: `apps/api/src/infrastructure/cache/redis-client.ts` (NEW)
  - Connect to Redis: `process.env.REDIS_URL || 'redis://localhost:6379'`
  - Handle connection errors gracefully
  - Export singleton instance

- [ ] Create cache decorator
  - File: `apps/api/src/infrastructure/cache/cached.ts` (NEW)
  - Decorator syntax: `@cached(ttlSeconds)`
  - Cache key: `ClassName:methodName:JSON(args)`
  - Example:
    ```typescript
    @cached(300) // Cache for 5 minutes
    async generateInventoryReport(startDate?, endDate?) {
      // Expensive calculation
    }
    ```

- [ ] Identify expensive queries to cache
  - Report generators (generateInventoryReport, generateDebtReport)
  - Summary calculations (debt summary, inventory summary)
  - Frequently-accessed lists (if read-heavy)

- [ ] Apply caching to services
  - Add `@cached(300)` to report generators (5 min TTL)
  - Add `@cached(60)` to summary endpoints (1 min TTL)
  - Add cache invalidation hooks on mutations

- [ ] Add cache invalidation
  - On mutation (create/update/delete), invalidate related caches
  - Example: After debt entry created, invalidate debt report cache
  - Use: `cacheClient.del('FinanceService:generateDebtReport:...')`

**Verification:**
- ✓ Redis connected and working
- ✓ Decorated methods return cached results
- ✓ Cache invalidates on mutations
- ✓ Performance improves for repeated calls (50x+ faster)
- ✓ All tests pass

---

### Task 3.3: Fix Fragile Cache Invalidation with Domain Events

**Status:** ⏳ Pending  
**Estimated:** 5 hours  
**Depends On:** Phase 2 complete  
**Blocks:** None

**Goal:** Automate cache invalidation based on domain events

**Work Items:**
- [ ] Create domain events model
  - File: `apps/web/src/features/app-shell/domain-events.ts` (NEW)
  - Define all domain events:
    - EmployeeCreated, EmployeeUpdated, EmployeeDeleted
    - ProjectCreated, ProjectUpdated, ProjectDeleted
    - DebtAccountCreated, DebtAccountUpdated
    - DebtEntryCreated
  - Create INVALIDATION_MAP: event type → query keys to invalidate
  - Example:
    ```typescript
    export const INVALIDATION_MAP = {
      'EmployeeCreated': ['employees', 'employeeStateHistory'],
      'ProjectCreated': ['projects', 'projectAssignments'],
      'DebtAccountCreated': ['debtAccounts', 'debtsSummary'],
    };
    ```

- [ ] Update mutation handlers
  - File: `apps/web/src/features/app-shell/workspace-mutations.ts`
  - When mutation succeeds, emit domain event
  - Look up affected query keys from INVALIDATION_MAP
  - Auto-invalidate those queries
  - Example:
    ```typescript
    onSuccess: (result, variables) => {
      const event = { type: 'EmployeeCreated', employeeId: result.id };
      const keysToInvalidate = INVALIDATION_MAP[event.type];
      keysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
    }
    ```

- [ ] Remove manual invalidation calls
  - Search: `invalidateWorkspaceDomains` calls
  - Replace hardcoded invalidation lists with auto-invalidation
  - Reduces duplication and error-prone manual tracking

- [ ] Document event types
  - Create: `docs/DOMAIN_EVENTS.md`
  - List all possible domain events
  - Show which queries each event invalidates

**Verification:**
- ✓ Domain events defined for all mutations
- ✓ INVALIDATION_MAP covers all query keys
- ✓ Mutations emit appropriate events
- ✓ Cache invalidates correctly without manual calls
- ✓ No stale data on screen after mutations
- ✓ All tests pass

---

### Task 3.4: Performance Testing at Scale

**Status:** ⏳ Pending  
**Estimated:** 8 hours  
**Depends On:** 2.4  
**Blocks:** None

**Goal:** Verify system performance with production-like data volumes

**Work Items:**
- [ ] Create test data generators
  - File: `apps/api/src/__tests__/fixtures/generate-test-data.ts` (NEW)
  - Generate 10k, 50k, 100k records for each entity
  - Realistic data distributions
  - Use Prisma to insert data directly (faster than API)
  - Functions:
    - `generateEmployees(count: number)`
    - `generateProjects(count: number)`
    - `generateDebtAccounts(count: number)`
    - etc.

- [ ] Write load tests
  - File: `apps/api/src/__tests__/performance.test.ts` (NEW)
  - Test: List operations with pagination <100ms for 100k records
  - Test: Report generation <1s with caching
  - Test: Search/filter operations <500ms
  - Test: Concurrent mutations (50 concurrent) - no deadlocks
  - Test: Memory usage stays <500MB

- [ ] Create performance benchmarks
  - Employee list (10k records, page 0): <100ms
  - Debt summary report: <1s (with cache: <50ms on repeat)
  - Concurrent creates (50x): <5s total, 0 errors
  - Document all baseline metrics

- [ ] Identify bottlenecks
  - Use Prisma query profiling
  - Check for missing indexes
  - Verify caching is working
  - Example: If query >500ms, profile why

- [ ] Document performance characteristics
  - Create: `docs/PERFORMANCE_CHARACTERISTICS.md`
  - Expected response times at each scale (1k, 10k, 100k)
  - Pagination recommendations
  - Cache TTL recommendations
  - Example: "With pagination, employees list handles 100k records in <100ms"

**Verification:**
- ✓ All endpoints <1000ms with 100k records
- ✓ List operations with pagination <100ms
- ✓ Report generation <1s (5-10ms with cache)
- ✓ No N+1 queries found
- ✓ Database indexes properly used
- ✓ Memory usage acceptable
- ✓ Concurrent operations handle 50+ simultaneous requests

---

## Progress Tracking

### Current Status
- Phase 1: ⏳ Not Started
- Phase 2: ⏳ Blocked (waiting for Phase 1)
- Phase 3: ⏳ Blocked (waiting for Phase 2)

### Completion Timeline
- **Phase 1 (Critical):** Days 1-7 (REQUIRED)
- **Phase 2 (High Priority):** Days 8-12 (REQUIRED)
- **Phase 3 (Medium Priority):** Days 13-16 (OPTIONAL)

---

## How to Use This Document

1. **Start with Phase 1 Task 1.1** - Split CompanyService
2. **Work until task is complete** - Check off all work items
3. **Mark task as complete** - Update status in task management system
4. **Move to next task** - Can work on tasks within same phase in any order
5. **Phase gates** - Don't start Phase 2 until Phase 1 complete
6. **Update this document** - Mark progress as you complete phases

### Command Reference

```bash
# View all tasks
/tasks

# Get detailed task info
/TaskGet #18  # Get details on task 18

# Mark task in progress
/TaskUpdate #18 status in_progress

# Mark task complete
/TaskUpdate #18 status completed

# View this file
docs/REFACTORING_TASKS.md
```

---

## Notes

- All estimated hours include testing and verification
- Tasks can be worked on in parallel within a phase
- Dependencies prevent starting next phase until current phase complete
- Phase 3 is optional - can skip for faster release if needed
- Total time can be reduced to 10 days by skipping Phase 3

---

**Last Updated:** May 3, 2026  
**Review Source:** Ultraplan Code Review  
**Status:** Ready to begin Phase 1
