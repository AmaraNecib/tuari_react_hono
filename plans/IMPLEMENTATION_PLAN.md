# Tuari Production-Ready Implementation Plan

**Created**: 2026-06-21
**Status**: Approved - Ready to Start
**Approach**: TDD for new features, then retroactive tests for old code

---

## Executive Summary

This plan transforms Tuari from a development prototype into a production-ready construction management application. Key decisions:

1. **Migrate from Prisma to Drizzle ORM** - enables SQLCipher support
2. **Full database encryption via SQLCipher** - protect all business data
3. **Deep module architecture** - small interfaces, deep implementations
4. **TDD workflow** - tests first for all new features

---

## Implementation Phases

### Phase 1: Database Layer Migration (Week 1-2)

#### 1.1 Prisma → Drizzle Migration

**Goal**: Replace Prisma with Drizzle ORM while maintaining all functionality

**Tasks**:
- [ ] Create Drizzle schema files (`src/schema/`)
- [ ] Migrate all table definitions from Prisma schema
- [ ] Create Drizzle database connection
- [ ] Rewrite all repository queries
- [ ] Update Better Auth to use Drizzle adapter
- [ ] Test all existing functionality
- [ ] Run `EXPLAIN QUERY PLAN` on all queries
- [ ] Add missing indexes based on EXPLAIN results
- [ ] Document query optimizations in `docs/QUERY_OPTIMIZATION.md`

**Schema Migration Example**:
```typescript
// Before (Prisma)
model Employee {
  id        String @id
  firstName String @map("first_name")
  lastName  String @map("last_name")
  phone     String @unique
  roleId    String @map("role_id")
  // ...
}

// After (Drizzle)
export const employee = sqliteTable('employee', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone').unique().notNull(),
  roleId: text('role_id').references(() => role.id),
  // ...
});
```

**Query Optimization with EXPLAIN**:
```sql
-- Run on all queries during migration
EXPLAIN QUERY PLAN SELECT ...;

-- Add indexes for full table scans
CREATE INDEX idx_employee_role ON employee(role_id);
CREATE INDEX idx_employee_status ON employee(status);
CREATE INDEX idx_project_manager ON project(manager_id);
-- etc.
```

---

#### 1.2 SQLCipher Encryption

**Goal**: Encrypt entire SQLite database

**Tasks**:
- [ ] Install `better-sqlite3-sqlcipher`
- [ ] Configure encryption key (derived from user password or setup key)
- [ ] Update database connection to use SQLCipher
- [ ] Test encryption works with Drizzle
- [ ] Test portable app builds with encrypted DB
- [ ] Document encryption approach in `docs/SECURITY.md`

**Implementation**:
```typescript
import Database from "better-sqlite3-sqlcipher";
import { drizzle } from "drizzle-orm/better-sqlite3";

// Initialize encrypted database
const sqlite = new Database("tuari.sqlite");
sqlite.pragma("key = 'your-encryption-key'");
sqlite.pragma("cipher_compatibility = 4");

const db = drizzle(sqlite);
```

---

### Phase 2: Architecture Refactor (Week 2-3)

#### 2.1 Deep Module Architecture

**Goal**: Transform shallow modules into deep modules with clear seams

**Current Problem**:
```
CompanyService (100+ methods, thin pass-through)
```

**Target Architecture**:
```
src/modules/
├── workforce/
│   ├── employee.module.ts          # Deep module: small interface
│   ├── employee.interface.ts       # What callers need to know
│   └── adapters/
│       ├── drizzle-employee.repository.ts    # Production adapter
│       └── in-memory-employee.repository.ts  # Test adapter
├── operations/
│   ├── project.module.ts
│   ├── warehouse.module.ts
│   └── adapters/
├── finance/
│   ├── debt.module.ts
│   └── adapters/
└── inventory/
    ├── inventory.module.ts
    └── adapters/
```

**Deep Module Example**:
```typescript
// employee.module.ts - Small interface, deep implementation
export class EmployeeModule {
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly roleRepository: RoleRepository,
  ) {}

  // Interface: Just 5 methods
  async list(filters: EmployeeFilters): Promise<Employee[]>
  async findById(id: string): Promise<Employee | null>
  async create(input: CreateEmployeeInput): Promise<Employee>
  async update(id: string, input: UpdateEmployeeInput): Promise<Employee>
  async delete(id: string): Promise<void>
  
  // All complex logic hidden inside
}
```

**Adapter Pattern (for testability)**:
```typescript
// employee.repository.ts - Interface
export interface EmployeeRepository {
  findById(id: string): Promise<EmployeeRow | null>;
  findAll(filters: EmployeeFilters): Promise<EmployeeRow[]>;
  save(employee: EmployeeRow): Promise<void>;
  delete(id: string): Promise<void>;
}

// drizzle-employee.repository.ts - Production adapter
export class DrizzleEmployeeRepository implements EmployeeRepository {
  constructor(private readonly db: DrizzleDB) {}
  
  async findById(id: string) {
    return this.db.select().from(employee).where(eq(employee.id, id)).get();
  }
  // ...
}

// in-memory-employee.repository.ts - Test adapter
export class InMemoryEmployeeRepository implements EmployeeRepository {
  private store = new Map<string, EmployeeRow>();
  
  async findById(id: string) {
    return this.store.get(id) ?? null;
  }
  // ...
}
```

**Tasks**:
- [ ] Create module interfaces
- [ ] Create Drizzle adapters (production)
- [ ] Create InMemory adapters (testing)
- [ ] Refactor services into deep modules
- [ ] Update RPC handlers to use new modules
- [ ] Write tests using InMemory adapters

---

### Phase 3: Role-Based Permissions (Week 3)

#### 3.1 Hybrid Permission System

**Goal**: 3 default roles (Admin, Manager, Viewer) with toggleable permissions

**Tasks**:
- [ ] Design permission schema
- [ ] Create role management module
- [ ] Add permission checks to all mutations
- [ ] Create admin UI for role management
- [ ] Test permission enforcement

**Permission Schema**:
```typescript
export const permissions = {
  employees: ['create', 'read', 'update', 'delete'],
  projects: ['create', 'read', 'update', 'delete'],
  warehouses: ['create', 'read', 'update', 'delete'],
  inventory: ['create', 'read', 'update', 'delete', 'transfer'],
  debts: ['create', 'read', 'update', 'settle'],
  reports: ['read', 'export'],
} as const;

export const defaultRoles = {
  ADMIN: Object.values(permissions).flat(), // All permissions
  MANAGER: ['employees:read', 'projects:*', 'warehouses:*', 'inventory:*', 'debts:read'],
  VIEWER: Object.keys(permissions).map(k => `${k}:read`),
};
```

---

### Phase 4: Invoice Management (Week 4)

#### 4.1 Invoice System (TDD)

**Goal**: Track purchases with line items and status workflow

**Tasks** (TDD - write tests first):
- [ ] Write tests for invoice creation
- [ ] Write tests for line item management
- [ ] Write tests for status workflow (DRAFT → RECEIVED → PAID)
- [ ] Implement invoice module
- [ ] Implement Drizzle adapter
- [ ] Create invoice UI components
- [ ] Test all edge cases

**Invoice Schema**:
```typescript
export const invoice = sqliteTable('invoice', {
  id: text('id').primaryKey(),
  invoiceNumber: text('invoice_number'),
  supplierId: text('supplier_id').references(() => externalCounterparty.id),
  warehouseId: text('warehouse_id').references(() => warehouse.id),
  projectId: text('project_id').references(() => project.id),
  status: text('status').notNull(), // DRAFT, RECEIVED, PAID
  totalAmount: real('total_amount').notNull(),
  paidAmount: real('paid_amount').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const invoiceLineItem = sqliteTable('invoice_line_item', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').references(() => invoice.id),
  itemId: text('item_id').references(() => inventoryItemDefinition.id),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  totalPrice: real('total_price').notNull(),
});
```

---

### Phase 5: Payment Processing (Week 5)

#### 5.1 Payment Allocation System (TDD)

**Goal**: Record payments and allocate across multiple invoices

**Tasks** (TDD - write tests first):
- [ ] Write tests for payment creation
- [ ] Write tests for allocation logic
- [ ] Write tests for balance updates
- [ ] Implement payment module
- [ ] Implement Drizzle adapter
- [ ] Create payment UI components
- [ ] Test edge cases (overpayment, partial payment, etc.)

**Payment Schema**:
```typescript
export const payment = sqliteTable('payment', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').references(() => externalCounterparty.id),
  amount: real('amount').notNull(),
  method: text('method').notNull(), // CASH, BANK_TRANSFER, CHECK
  paymentDate: integer('payment_date', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const paymentAllocation = sqliteTable('payment_allocation', {
  id: text('id').primaryKey(),
  paymentId: text('payment_id').references(() => payment.id),
  invoiceId: text('invoice_id').references(() => invoice.id),
  amount: real('amount').notNull(),
});
```

---

### Phase 6: Pagination (Week 5)

#### 6.1 Cursor-Based Pagination (TDD)

**Goal**: Add pagination to all list endpoints

**Tasks** (TDD - write tests first):
- [ ] Write tests for cursor encoding/decoding
- [ ] Write tests for pagination logic
- [ ] Implement pagination utility
- [ ] Add pagination to all list queries
- [ ] Create pagination UI components
- [ ] Test edge cases (empty results, single page, etc.)

**Pagination Schema**:
```typescript
export type CursorPaginationInput = {
  cursor?: string; // Encoded cursor
  limit?: number; // Default: 50
};

export type PaginatedResult<T> = {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
};
```

---

### Phase 7: Retroactive Tests (Week 6)

**Goal**: Add tests for existing features that lack coverage

**Tasks**:
- [ ] Audit existing test coverage
- [ ] Write integration tests for employee lifecycle
- [ ] Write integration tests for project/warehouse flows
- [ ] Write integration tests for debt management
- [ ] Write integration tests for inventory transfers
- [ ] Aim for 80%+ coverage on critical paths

---

## Query Optimization Strategy

### During Migration

1. **Run EXPLAIN on all queries**
   ```sql
   EXPLAIN QUERY PLAN SELECT ...;
   ```

2. **Identify full table scans**
   - Look for "SCAN TABLE" in output
   - These need indexes

3. **Add indexes**
   ```sql
   CREATE INDEX idx_employee_role ON employee(role_id);
   CREATE INDEX idx_employee_status ON employee(status);
   CREATE INDEX idx_project_manager ON project(manager_id);
   CREATE INDEX idx_debt_account_worker ON debt_account(worker_id);
   -- etc.
   ```

4. **Document improvements**
   - Before/after EXPLAIN results
   - Index list
   - Performance metrics

### Index Strategy

Based on current schema, add these indexes:

```sql
-- Employee queries
CREATE INDEX idx_employee_role ON employee(role_id);
CREATE INDEX idx_employee_status ON employee(status);
CREATE INDEX idx_employee_phone ON employee(phone);

-- Project queries
CREATE INDEX idx_project_manager ON project(manager_id);
CREATE INDEX idx_project_status ON project(status);

-- Warehouse queries
CREATE INDEX idx_warehouse_manager ON warehouse(manager_id);
CREATE INDEX idx_warehouse_status ON warehouse(status);

-- Debt queries
CREATE INDEX idx_debt_worker ON debt_account(worker_id);
CREATE INDEX idx_debt_external ON debt_account(external_counterparty_id);
CREATE INDEX idx_debt_status ON debt_account(status);
CREATE INDEX idx_debt_entry_account ON debt_entry(debt_account_id);
CREATE INDEX idx_debt_entry_date ON debt_entry(entry_date);

-- Inventory queries
CREATE INDEX idx_inventory_entry_invoice ON inventory_entry(invoice_group_id);
CREATE INDEX idx_inventory_entry_item ON inventory_entry(item_definition_id);
CREATE INDEX idx_inventory_entry_warehouse ON inventory_entry(warehouse_id);
CREATE INDEX idx_inventory_entry_project ON inventory_entry(project_id);

-- Assignment queries
CREATE INDEX idx_assignment_employee ON employee_project_assignment(employee_id);
CREATE INDEX idx_assignment_project ON employee_project_assignment(project_id);
```

---

## Testing Strategy

### TDD Workflow (For New Features)

```
1. RED: Write failing test
2. GREEN: Write minimum code to pass
3. REFACTOR: Improve code while tests pass
```

### Test Pyramid

```
        E2E (5-10 tests)
           ↑
    Integration (50+ tests)
           ↑
      Unit (200+ tests)
```

### Adapter Testing

Each module will have tests using InMemory adapters:
```typescript
describe('EmployeeModule', () => {
  let module: EmployeeModule;
  let repository: InMemoryEmployeeRepository;

  beforeEach(() => {
    repository = new InMemoryEmployeeRepository();
    module = new EmployeeModule(repository, new InMemoryRoleRepository());
  });

  it('creates employee with valid input', async () => {
    const employee = await module.create({
      firstName: 'Ahmed',
      lastName: 'Ben Ali',
      phone: '0555123456',
      roleId: 'worker',
    });

    expect(employee.firstName).toBe('Ahmed');
  });
});
```

---

## File Structure (Target)

```
src/
├── modules/
│   ├── workforce/
│   │   ├── employee.module.ts
│   │   ├── employee.interface.ts
│   │   └── adapters/
│   │       ├── drizzle-employee.repository.ts
│   │       └── in-memory-employee.repository.ts
│   ├── operations/
│   │   ├── project.module.ts
│   │   ├── warehouse.module.ts
│   │   └── adapters/
│   ├── finance/
│   │   ├── debt.module.ts
│   │   ├── payment.module.ts
│   │   └── adapters/
│   └── inventory/
│       ├── inventory.module.ts
│       ├── invoice.module.ts
│       └── adapters/
├── schema/
│   ├── employee.ts
│   ├── project.ts
│   ├── warehouse.ts
│   ├── debt.ts
│   ├── inventory.ts
│   ├── invoice.ts
│   ├── payment.ts
│   └── index.ts
├── rpc/
│   ├── handlers/
│   │   ├── workforce.ts
│   │   ├── operations.ts
│   │   ├── finance.ts
│   │   └── inventory.ts
│   └── router.ts
└── infrastructure/
    ├── auth/
    ├── database/
    │   ├── drizzle.ts
    │   └── sqlcipher.ts
    └── config/
```

---

## Success Criteria

- [ ] All data encrypted at rest (SQLCipher)
- [ ] Deep modules with small interfaces
- [ ] All new features have tests (TDD)
- [ ] Query optimization documented
- [ ] Role-based permissions working
- [ ] Invoice management functional
- [ ] Payment allocation working
- [ ] Pagination on all lists
- [ ] 80%+ test coverage on critical paths
- [ ] Portable app builds successfully

---

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1-2 | Drizzle + SQLCipher | Encrypted DB, working queries |
| 2-3 | Deep Modules | Adapters, refactored services |
| 3 | Permissions | Role-based access control |
| 4 | Invoices | Invoice CRUD with line items |
| 5 | Payments + Pagination | Payment allocation, cursor pagination |
| 6 | Retroactive Tests | 80%+ coverage |

**Total Estimated Time**: 6 weeks

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Drizzle migration breaks features | Comprehensive test suite before migration |
| SQLCipher performance issues | Benchmark queries, add indexes |
| Portable app won't build | Test builds early, fix native module issues |
| Scope creep | Stick to plan, defer new features |

---

**Plan Approved By**: User
**Date**: 2026-06-21
**Next Step**: Begin Phase 1 - Drizzle Migration
