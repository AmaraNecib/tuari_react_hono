# Full Code Review & Refactoring Plan

**Date**: May 3, 2026  
**Overall Score**: 6.5/10 (based on CODE_REVIEW.md)  
**Status**: Comprehensive review needed - many architectural issues require refactoring

---

## EXECUTIVE SUMMARY

The codebase has a solid foundation with good module separation, working tests, and basic architecture. However, critical architectural, performance, and security issues must be addressed before production use. Key problems:

- **God Objects**: CompanyService (1774 LOC) and CompanyRepository (1746 LOC) doing too much
- **No Pagination**: List endpoints return ALL records (crash with large datasets)
- **N+1 Queries**: High risk of inefficient database queries
- **Security Gaps**: Input validation not centralized, no audit trails for sensitive ops
- **Missing Observability**: No structured logging, no request tracing
- **Architectural Debt**: Facade pattern adds no value, no transaction boundaries

---

## SECTION 1: CRITICAL ISSUES (Fix Immediately)

### 1.1 Massive Service Classes - GOD OBJECTS 🚨

**Files Affected:**
- `apps/api/src/modules/company/company.service.ts` (1774 lines)
- `apps/api/src/modules/company/company.repository.ts` (1746 lines)

**Problem:**
CompanyService handles 50+ use cases across 8+ domains:
- Employees, Roles, External Parties
- Projects, Warehouses, Assignments
- Debt Accounts, Debt Entries, Settlements
- Salary Payments, System Logs
- Managers, Managers Ownership History

This violates Single Responsibility Principle. Changes to one domain break unrelated code.

**Example Issue:**
```typescript
// Line 209-290 in company.service.ts
createDebtAccount() // Finance domain
listEmployees()    // Workforce domain  
createProject()    // Operations domain
// All in same 1774-line file!
```

**Impact**: 
- Hard to test (need full setup for any operation)
- Difficult to understand (too many concerns)
- Risky to modify (cascading side effects)

**Recommendation**: Split into domain-specific services

#### Action Items:

**1.1a - Extract WorkforceService Properly**
```
FROM: company.service.ts (workforce methods)
TO: workforce.service.ts (real implementation, not facade)

Methods to move:
- listEmployees → EmployeeRepository
- createEmployee → EmployeeService.create()
- getRole → RoleRepository
- createRole → RoleService.create()
- listExternalCounterparties → ExternalCounterpartyRepository
- createExternalCounterparty → ExternalCounterpartyService.create()
- Employee assignments (3+ methods)
- Salary payments (4+ methods)
```

**1.1b - Extract FinanceService (Debt Operations)**
```
FROM: company.service.ts (lines 191-380, debt methods)
TO: finance.service.ts (new)

Methods to move:
- listDebtAccounts
- createDebtAccount
- getDebtAccount
- listDebtEntries
- createDebtEntry
- settleDebtAccount
- getDebtPartyDetail
```

**1.1c - Extract OperationsService (Projects & Warehouses)**
```
FROM: company.service.ts (operations methods)
TO: operations.service.ts (real implementation)

Methods to move:
- listProjects
- createProject
- updateProject
- deleteProject
- Project assignments (3+ methods)
- listWarehouses
- createWarehouse
- updateWarehouse
- Warehouse assignments (3+ methods)
```

**1.1d - Split CompanyRepository (1746 lines)**
```
Same domain split:
- EmployeeRepository (new file)
- RoleRepository (new file)
- ProjectRepository (new file)
- WarehouseRepository (new file)
- DebtRepository (new file)
- ExternalCounterpartyRepository (new file)

Keep CompanyRepository as a facade that composes these (with clear orchestration layer)
```

---

### 1.2 No Pagination - Data Loading Issue 🚨

**Files Affected:**
- `apps/api/src/rpc/router.ts` - all list endpoints
- `apps/web/src/features/app-shell/workspace-queries.ts` - query definitions

**Problem:**
```typescript
// Current: Returns ALL records
employeesList: oc
  .input(employeeListInputSchema) // No limit/offset!
  .output(createListSchema(employeeSchema))

// If 1M employees → loads 1M records into memory → crashes
```

**Impact**: 
- Scales to 100 employees, fails at 10,000
- Network bottleneck (sending 1000+ records)
- Client memory exhaustion
- N+1 risk increases with data volume

**Recommendation**: Implement cursor-based or offset pagination

#### Action Items:

**1.2a - Define Pagination Schema**
```typescript
// packages/contracts/src/pagination.ts (NEW FILE)
export const paginationInputSchema = z.object({
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  sortBy: z.enum(['createdAt', 'name', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const paginatedSchema = <T extends ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    hasMore: z.boolean(),
    offset: z.number(),
    limit: z.number(),
  });
```

**1.2b - Update All List Endpoints**
```typescript
// apps/api/src/rpc/router.ts
employeesList: oc
  .input(paginationInputSchema)
  .output(paginatedSchema(employeeSchema))
  
employeeStateHistoryList: oc
  .input(paginationInputSchema)
  .output(paginatedSchema(employeeStateHistorySchema))
  
// ... repeat for all list endpoints (20+ total)
```

**1.2c - Update Repository Methods**
```typescript
// apps/api/src/modules/company/employee.repository.ts
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
  
  return {
    items,
    total,
    hasMore: (pagination?.offset ?? 0) + items.length < total,
    offset: pagination?.offset ?? 0,
    limit: pagination?.limit ?? 20,
  };
}
```

**1.2d - Update Web Queries**
```typescript
// apps/web/src/features/app-shell/workspace-queries.ts
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

---

### 1.3 Input Validation Not Centralized 🔴

**Problem:**
- Zod schemas exist but only at contract layer
- No middleware enforces validation before handler execution
- Vulnerable to bypasses if handler receives wrong shape

**Current State:**
```typescript
// Validation happens at HTTP layer (ORPC)
// But if handler calls other handlers directly, no validation
```

**Recommendation**: Add validation middleware

#### Action Items:

**1.3a - Check if InputValidator is being used**
```bash
grep -r "InputValidator" /home/user/repo/apps/api/src --include="*.ts"
```

**1.3b - Ensure validation middleware wraps all handlers**
Review `apps/api/src/rpc/rpc-middleware.ts` to confirm:
- ✓ Input is validated against schema
- ✓ Validation errors return clear messages
- ✓ Applied to ALL mutation handlers
- ✓ Applied to ALL query handlers with input

**1.3c - Document validation patterns**
Create `apps/api/src/infrastructure/validation/README.md`:
- Schema validation locations
- Error response format
- Field-level error handling

---

### 1.4 No Structured Logging / Observability 🔴

**Problem:**
- No request/response logging
- No audit trail for sensitive operations
- No performance metrics
- Difficult to debug production issues

**Current State:**
- systemLog table exists but only for certain operations
- No middleware logging

**Recommendation**: Add structured logging middleware

#### Action Items:

**1.4a - Create Logging Middleware**
```typescript
// apps/api/src/infrastructure/logging/logging-middleware.ts (NEW FILE)
export function createLoggingMiddleware() {
  return {
    before: (name: string, input: unknown, context: RpcContext) => {
      const requestId = generateId();
      const start = Date.now();
      
      logger.info('rpc_request_started', {
        requestId,
        handlerName: name,
        userId: context.user?.id,
        ip: resolveClientIp(context),
        timestamp: new Date().toISOString(),
      });
      
      return { requestId, start };
    },
    
    after: (metadata: any, result: unknown, error?: unknown) => {
      const duration = Date.now() - metadata.start;
      
      if (error) {
        logger.error('rpc_request_failed', {
          requestId: metadata.requestId,
          duration,
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        logger.info('rpc_request_succeeded', {
          requestId: metadata.requestId,
          duration,
        });
      }
    },
  };
}
```

**1.4b - Integrate into Router**
```typescript
// apps/api/src/rpc/router.ts
const loggingMW = createLoggingMiddleware();

export function createRouter(...) {
  return os.router({
    // Each handler wrapped with logging
    handler: loggingMW.wrap(actualHandler),
  });
}
```

**1.4c - Create Audit Log for Sensitive Operations**
```typescript
// apps/api/src/modules/company/audit-logger.ts (NEW FILE)
export class AuditLogger {
  constructor(private db: Database) {}
  
  async logOperation(
    operation: 'create' | 'update' | 'delete',
    entity: string,
    entityId: string,
    actor: SessionUser,
    changes: Record<string, any>
  ) {
    await this.db.auditLog.create({
      data: {
        operation,
        entity,
        entityId,
        actorId: actor.id,
        actorEmail: actor.email,
        changes: JSON.stringify(changes),
        timestamp: new Date(),
      },
    });
  }
}
```

---

## SECTION 2: HIGH PRIORITY ISSUES

### 2.1 N+1 Query Problems

**Problem:**
Repositories don't use `include` for relationships. Accessing related data fires extra queries.

**Example Risk:**
```typescript
// This pattern is risky:
const employees = await employeeRepository.listEmployees();
for (const emp of employees) {
  console.log(emp.role.name); // QUERY FOR EACH EMPLOYEE! N+1
}
```

**Files to Review:**
- `apps/api/src/modules/company/company.repository.ts` (1746 lines)
- `apps/api/src/modules/inventory/inventory.repository.ts` (632 lines)

**Recommendation**: 
- Add Prisma `include` statements for frequently accessed relationships
- Document which relationships are eager-loaded
- Add database indexes on foreign keys

#### Action Items:

**2.1a - Audit Repository Methods**
For each `findMany` call, verify:
- ✓ Includes necessary relationships (role, assignments, etc.)
- ✓ Only selects needed fields (not SELECT *)
- ✓ Has proper indexes on WHERE clauses

**2.1b - Add Database Indexes**
```prisma
// apps/api/src/infrastructure/database/prisma/schema.prisma
model Employee {
  id String @id
  status String @db.VarChar(50) @index // Add index for filtering
  roleId String @db.Uuid @index // Add index for foreign key
  createdAt DateTime @default(now()) @index // Add index for sorting
  
  // ... rest of fields
  
  @@index([status, createdAt]) // Composite index for common queries
}
```

**2.1c - Document Query Patterns**
```typescript
// apps/api/src/modules/company/README.md (ADD SECTION)
## Query Optimization

### Eager Loading
All list operations should include related data:
- Employee.role
- Project.manager
- WarehouseAssignment.warehouse

### Avoid These:
```typescript
// ❌ DON'T: Load then iterate
employees.map(e => e.role.name) // N+1!

// ✅ DO: Include in query
employees({ include: { role: true } })
```

---

### 2.2 No Transaction Management 🔴

**Problem:**
Multi-step operations (create employee → assign to project → log) have no transaction boundaries.

If step 2 fails, step 1 is orphaned.

**Current State:**
- `TransactionManager` class exists in company.service.ts
- But used inconsistently

**Recommendation**: Ensure all multi-step mutations use transactions

#### Action Items:

**2.2a - Verify Transaction Usage**
```bash
grep -n "withTransaction\|transactionManager" \
  /home/user/repo/apps/api/src/modules/company/company.service.ts
```

**2.2b - Document Transaction Boundaries**
```typescript
// apps/api/src/modules/company/finance.service.ts
async createDebtAccount(
  input: DebtAccountCreateInput,
  auditContext: MutationAuditContext
) {
  // Wrap entire operation in transaction
  return this.transactionManager.execute(async () => {
    // Step 1: Create account
    const account = await this.repository.createDebtAccount(input);
    
    // Step 2: Create opening entry
    if (input.openingBalance !== 0) {
      await this.repository.createDebtEntry({
        accountId: account.id,
        amount: input.openingBalance,
        type: 'OPENING',
      });
    }
    
    // Step 3: Log to system
    await this.systemLog.log('DEBT_ACCOUNT_CREATED', {
      accountId: account.id,
      amount: input.openingBalance,
    });
    
    // All succeed together, or all rollback
    return account;
  });
}
```

**2.2c - Add Transaction Tests**
```typescript
// apps/api/src/modules/company/finance.service.test.ts
describe('createDebtAccount transactions', () => {
  it('rollback all changes if entry creation fails', async () => {
    // Mock entry creation to fail
    jest.spyOn(repository, 'createDebtEntry')
      .mockRejectedValueOnce(new Error('DB error'));
    
    // Attempt to create account
    await expect(service.createDebtAccount(...)).rejects.toThrow();
    
    // Verify account was NOT created
    const account = await repository.getDebtAccount(accountId);
    expect(account).toBeNull();
  });
});
```

---

### 2.3 Error Handling Gaps 🟠

**Problem:**
- Generic `AppMutationError` doesn't distinguish error types
- No retry information in responses
- Client can't determine if error is retryable

**Recommendation**: Implement error hierarchy

#### Action Items:

**2.3a - Create Error Hierarchy**
```typescript
// apps/api/src/infrastructure/errors/app-errors.ts (NEW FILE)
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    public fieldErrors: Record<string, string>,
    retryable = false
  ) {
    super('VALIDATION_ERROR', 400, 'Validation failed', retryable);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', 404, message, false);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', 409, message, true); // Retryable after refresh
  }
}

export class RateLimitError extends AppError {
  constructor(public retryAfterSeconds: number) {
    super('RATE_LIMIT', 429, 'Too many requests', true);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super('DATABASE_ERROR', 500, message, true); // Retryable with backoff
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super('UNAUTHORIZED', 401, message, false);
  }
}
```

**2.3b - Update Error Response Format**
```typescript
// apps/api/src/rpc/response-builders.ts
export function buildErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: error.retryable,
        retryAfterSeconds: error instanceof RateLimitError 
          ? error.retryAfterSeconds 
          : undefined,
        fieldErrors: error instanceof ValidationError
          ? error.fieldErrors
          : undefined,
      },
    };
  }
  
  // Generic error
  return {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
      retryable: false,
    },
  };
}
```

**2.3c - Update Handlers to Use Error Types**
```typescript
// Example in finance.service.ts
createDebtAccount(input, auditContext) {
  const role = await this.roleRepository.findById(input.roleId);
  if (!role) {
    throw new NotFoundError(`Role ${input.roleId} not found`);
  }
  
  const existing = await this.findExisting(...);
  if (existing) {
    throw new ConflictError(
      'Debt account already exists for this party'
    );
  }
  
  if (!isValidAmount(input.openingBalance)) {
    throw new ValidationError({
      openingBalance: 'Must be a valid number',
    });
  }
}
```

---

### 2.4 File Size Issues

**Files that need splitting:**
1. `company.service.ts` (1774 LOC) → Split into 4 domain services (see 1.1)
2. `company.repository.ts` (1746 LOC) → Split into 6 domain repositories (see 1.1)
3. `workspace-mutations.ts` (811 LOC) → Keep as is (contains all mutations, by design)
4. `inventory.service.ts` (876 LOC) → Consider splitting by operation type

---

## SECTION 3: MEDIUM PRIORITY ISSUES

### 3.1 No API Versioning

**Problem:**
- Single `/` endpoint
- Breaking API changes will break all clients

**Recommendation**: Add versioning

#### Action Items:

**3.1a - Update Router Registration**
```typescript
// apps/api/src/rpc/router.ts
export function createRouter(deps, version: string = 'v1') {
  // Routes will be prefixed with /api/v1/, /api/v2/, etc.
  return createOrpcRouter({
    prefix: `/api/${version}`,
    // ... handlers
  });
}
```

**3.1b - Update API Setup**
```typescript
// apps/api/src/app/create-app.ts
export function createApp(deps) {
  const app = express();
  
  // Mount versioned routers
  app.use('/api/v1', createRouter(deps, 'v1'));
  // app.use('/api/v2', createRouter(deps, 'v2')); // Future
  
  return app;
}
```

---

### 3.2 No Caching Strategy

**Problem:**
- React Query only (client-side)
- Expensive queries (complex aggregations) recompute for every request

**Recommendation**: Add Redis caching

#### Action Items:

**3.2a - Set up Redis client**
```typescript
// apps/api/src/infrastructure/cache/redis-client.ts (NEW FILE)
import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('Redis error:', err));
```

**3.2b - Create cache decorator**
```typescript
// apps/api/src/infrastructure/cache/cached.ts (NEW FILE)
export function cached(ttlSeconds: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;
      
      // Try cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
      
      // Execute and cache
      const result = await originalMethod.apply(this, args);
      await redisClient.setEx(
        cacheKey,
        ttlSeconds,
        JSON.stringify(result)
      );
      
      return result;
    };
    
    return descriptor;
  };
}
```

---

### 3.3 No Database Indexes on Key Fields

**Problem:**
- Queries filter on status, roleId, etc. without indexes
- Performance degrades as data grows

**Recommendation**: Add strategic indexes

#### Action Items:

**3.3a - Review Common Query Patterns**
```bash
grep -r "where.*status\|where.*roleId\|where.*createdAt" \
  /home/user/repo/apps/api/src/modules --include="*.ts" | head -20
```

**3.3b - Add Indexes to Schema**
```prisma
// apps/api/src/infrastructure/database/prisma/schema.prisma
model Employee {
  id String @id
  status String @db.VarChar(50) @index
  roleId String @db.Uuid @index
  createdAt DateTime @default(now()) @index
  updatedAt DateTime @updatedAt @index
  
  // Composite indexes for common filters
  @@index([status, createdAt])
  @@index([roleId, status])
}

model DebtAccount {
  id String @id
  status String @db.VarChar(50) @index
  createdAt DateTime @default(now()) @index
  
  @@index([status, createdAt])
}
```

**3.3c - Run Migration**
```bash
pnpm --filter=@tuari/api prisma migrate dev --name add_indexes
```

---

### 3.4 Fragile Mutation Invalidation

**Problem:**
```typescript
// workspace-mutations.ts
await invalidateWorkspaceDomains(queryClient, userId, 
  ["employees", "projects", "warehouses", "debtsSummary", "debtsDetail"]
);
// Developer must manually track all affected domains
// Easy to miss → stale cache
```

**Recommendation**: Automatic invalidation via domain events

#### Action Items:

**3.4a - Create Domain Events**
```typescript
// apps/web/src/features/app-shell/domain-events.ts (NEW FILE)
export type DomainEvent =
  | { type: 'EmployeeCreated'; employeeId: string }
  | { type: 'EmployeeUpdated'; employeeId: string }
  | { type: 'ProjectCreated'; projectId: string }
  | { type: 'ProjectUpdated'; projectId: string }
  | { type: 'DebtAccountCreated'; accountId: string }
  | { type: 'DebtEntryCreated'; accountId: string };

export const INVALIDATION_MAP: Record<DomainEvent['type'], string[]> = {
  'EmployeeCreated': ['employees', 'employeeStateHistory', 'debtAccounts'],
  'EmployeeUpdated': ['employees', 'employeeStateHistory'],
  'ProjectCreated': ['projects', 'projectAssignments'],
  'ProjectUpdated': ['projects', 'projectAssignments'],
  'DebtAccountCreated': ['debtAccounts', 'debtsSummary'],
  'DebtEntryCreated': ['debtAccounts', 'debtsSummary', 'debtsDetail'],
};
```

**3.4b - Update Mutation Handlers**
```typescript
// workspace-mutations.ts
onSuccess: (result, variables) => {
  // Publish domain event
  const event = {
    type: 'EmployeeCreated',
    employeeId: result.item.id,
  };
  
  // Auto-invalidate based on event
  const keysToInvalidate = INVALIDATION_MAP[event.type];
  keysToInvalidate.forEach(key => {
    queryClient.invalidateQueries({
      queryKey: [key],
    });
  });
}
```

---

## SECTION 4: IMPLEMENTATION ROADMAP

### Phase 1: CRITICAL (Week 1-2)
1. ✅ Split CompanyService into domain services
2. ✅ Add pagination to all list endpoints
3. ✅ Centralize input validation (verify middleware is applied)
4. ✅ Add structured logging middleware
5. ✅ Implement error hierarchy

### Phase 2: HIGH PRIORITY (Week 3-4)
1. ✅ Audit N+1 queries and add eager loading
2. ✅ Verify transaction management
3. ✅ Update all error handling to use new hierarchy
4. ✅ Create audit logging for sensitive operations
5. ✅ Add database indexes

### Phase 3: MEDIUM PRIORITY (Week 5-6)
1. ✅ Implement API versioning
2. ✅ Set up Redis caching
3. ✅ Implement automatic mutation invalidation
4. ✅ Write integration tests for cross-domain flows
5. ✅ Add OpenAPI documentation

### Phase 4: POLISH (Week 7+)
1. ✅ Performance profiling and optimization
2. ✅ Security audit
3. ✅ Load testing
4. ✅ Documentation improvements

---

## VERIFICATION CHECKLIST

After implementing changes, verify:

### Code Quality
- [ ] No files > 500 LOC (except tests and generated code)
- [ ] All `any` types removed from handler signatures
- [ ] All repositories have eager-loaded relationships
- [ ] All errors use proper error hierarchy

### Database
- [ ] All frequently-queried fields have indexes
- [ ] No N+1 queries in common operations
- [ ] Transactions used for multi-step operations
- [ ] Query performance tested with 10k+ records

### API
- [ ] All list endpoints support pagination
- [ ] Rate limiting applies to all endpoints
- [ ] Structured logging for all requests
- [ ] Error responses include retry information

### Security
- [ ] No input bypasses
- [ ] Audit log covers sensitive operations
- [ ] Rate limiting prevents brute force
- [ ] Session handling verified

### Testing
- [ ] Unit tests for all domain logic
- [ ] Integration tests for cross-domain flows
- [ ] E2E tests for critical user paths
- [ ] Performance tests for list operations with pagination

---

## CRITICAL FILES TO REFACTOR

| File | Current | Target | Priority |
|------|---------|--------|----------|
| company.service.ts | 1774 LOC | 350 LOC | 🔴 CRITICAL |
| company.repository.ts | 1746 LOC | 300 LOC | 🔴 CRITICAL |
| workspace-queries.ts | 811 LOC | 600 LOC | 🟡 MEDIUM |
| inventory.service.ts | 876 LOC | 500 LOC | 🟠 HIGH |
| workspace-mutations.ts | 811 LOC | Keep | 🟢 OK |

---

## EXPECTED OUTCOMES

After completing this refactoring:

- **Code Score**: 6.5/10 → 8.5/10
- **Scalability**: 100 users → 100k users
- **Maintainability**: Easy to add new features
- **Security**: Production-ready
- **Performance**: Sub-second list operations with 1M records

---

## Notes

- ARCHITECTURE_IMPROVEMENTS.md documents completed fixes
- CODE_REVIEW.md provides detailed analysis
- Rate limiting already implemented in middleware
- InputValidator infrastructure exists, needs verification of usage