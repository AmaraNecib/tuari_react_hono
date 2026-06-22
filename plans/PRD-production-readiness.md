# PRD: Tuari Production Readiness

**Status**: Ready for Agent
**Triage**: `ready-for-agent`
**Created**: 2026-06-21
**Target Timeline**: 6 weeks

---

## Problem Statement

Tuari is a construction management desktop application that entrepreneurs in the construction industry use to manage their employees, warehouses, projects, inventory, and debts. The application is functional but has critical gaps that prevent it from being sold to customers:

1. **Data is stored unencrypted at rest** - Names, phone numbers, salaries, and debt amounts are readable if someone gains access to the SQLite file, exposing sensitive business information.

2. **The codebase has architectural problems** - A single `CompanyService` has 100+ methods spanning multiple domains (workforce, operations, finance, inventory), making it hard to maintain, test, and extend.

3. **Critical business features are missing** - Users cannot track invoices for purchases, cannot record payments against debt accounts, and cannot paginate large lists of records.

4. **Role-based access control is incomplete** - Only the bootstrap owner (first user) can perform mutations. There is no support for delegating access to managers or read-only users.

5. **Test coverage has gaps** - There are no integration tests for cross-domain workflows. Unit tests exist but rely heavily on mocking Prisma directly.

6. **Query performance is unverified** - No `EXPLAIN QUERY PLAN` analysis has been done. The application may slow down as data grows.

The entrepreneur cannot sell this application to customers until these issues are resolved. Customers expect their data to be secure, the application to be fast with large datasets, and the workflows to support real construction business operations.

---

## Solution

Transform Tuari into a production-ready application through seven coordinated work streams:

### 1. Migrate from Prisma to Drizzle ORM with SQLCipher

Replace the current Prisma + better-sqlite3 stack with Drizzle ORM + better-sqlite3-sqlcipher. This unblocks full database encryption while keeping the portable app approach intact.

### 2. Implement Deep Module Architecture with Adapters

Refactor the monolithic `CompanyService` into domain modules with small interfaces and deep implementations. Each module will have two adapters: a Drizzle adapter for production and an InMemory adapter for fast testing.

### 3. Add Hybrid Role-Based Permissions

Implement a three-tier role system (Admin, Manager, Viewer) with the ability to toggle specific permissions per role. The Admin role has all permissions by default; Manager and Viewer have sensible defaults that admins can customize.

### 4. Build Invoice Management

Add full invoice tracking with line items, supplier linkage, status workflow (DRAFT → RECEIVED → PAID), and debt account linkage. Users will be able to record purchases and see which invoice created which debt.

### 5. Build Payment Processing with Allocation

Add payment recording with the ability to allocate a single payment across multiple invoices. Payment methods include cash, bank transfer, and check. Balance updates flow automatically to debt accounts.

### 6. Add Cursor-Based Pagination

Implement cursor-based pagination across all list endpoints. Default page size is 50 records with previous/next navigation. This prevents UI lag as datasets grow.

### 7. Achieve Comprehensive Test Coverage

Write integration tests for cross-domain workflows using InMemory adapters. Aim for 80%+ coverage on critical paths. Add query optimization analysis with `EXPLAIN QUERY PLAN` documentation.

---

## User Stories

### Migration and Architecture Stories

1. As a developer, I want to migrate from Prisma to Drizzle ORM, so that we can use SQLCipher for database encryption.

2. As a developer, I want to write database queries using TypeScript types directly, so that I don't need to run a code generation step after every schema change.

3. As a developer, I want to encrypt the entire SQLite database file, so that business data cannot be read without the encryption key.

4. As a developer, I want the encryption key to be derived from the user's setup key, so that each installation has its own encryption boundary.

5. As a developer, I want to verify that the encrypted database works in the portable Tauri app, so that customers can run the app from a USB drive with encrypted data.

6. As a developer, I want to run `EXPLAIN QUERY PLAN` on every query during migration, so that I can identify and fix performance problems before they affect users.

7. As a developer, I want to document all query optimizations in a dedicated file, so that future developers understand why specific indexes exist.

8. As a developer, I want to add database indexes for all foreign keys and frequently filtered columns, so that queries remain fast as data grows.

9. As a developer, I want the `CompanyService` God Object split into domain modules, so that each module has a clear responsibility and small interface.

10. As a developer, I want each module to have a Drizzle adapter for production and an InMemory adapter for tests, so that tests run fast without database setup.

11. As a developer, I want modules to have small public interfaces (few methods), so that calling code remains simple and testable.

12. As a developer, I want to follow the deep module pattern where complexity is hidden inside the module, so that callers don't need to understand implementation details.

13. As a developer, I want to use the existing oRPC contract boundary as the highest test seam, so that tests cover real user interactions.

14. As a developer, I want to use the module interface as a secondary test seam, so that I can test business logic without HTTP overhead.

15. As a developer, I want the existing `company.repository.ts` patterns preserved during refactoring, so that the team can transition gradually.

16. As a developer, I want to update ADR-001 to reflect the new persistence strategy, so that architectural decisions remain documented.

### Role-Based Permissions Stories

17. As an admin, I want to assign roles to other users, so that they can perform appropriate actions based on their responsibilities.

18. As an admin, I want to define what each role can do (create, read, update, delete) for each entity type, so that the permission system matches my business needs.

19. As a manager, I want to be able to manage employees, projects, and warehouses, so that I can run day-to-day operations without needing admin access.

20. As a viewer, I want to see all data without being able to modify it, so that I can review information without risk of accidental changes.

21. As an admin, I want the system to enforce permissions on every mutation, so that unauthorized users cannot make changes even if they bypass the UI.

22. As a developer, I want permission checks to happen at the RPC handler boundary, so that business logic remains unaware of authorization concerns.

23. As a user, I want to receive a clear error message when I attempt an unauthorized action, so that I understand why the action failed.

24. As an admin, I want to see a list of all permissions and which roles have them, so that I can audit the access control setup.

25. As a developer, I want permission checks to be testable in isolation, so that I can verify the authorization system works correctly.

### Invoice Management Stories

26. As a user, I want to create an invoice when I purchase materials, so that I can track what I bought and from whom.

27. As a user, I want to add multiple line items to an invoice (different items, quantities, prices), so that I can record a complete purchase in one document.

28. As a user, I want to specify which warehouse or project received the items from an invoice, so that inventory is updated correctly.

29. As a user, I want to link an invoice to an external counterparty (supplier), so that I can track who I bought from.

30. As a user, I want invoices to have a status (DRAFT, RECEIVED, PAID), so that I can see at a glance which invoices are pending.

31. As a user, I want an invoice to automatically create a debt entry when marked as RECEIVED, so that my debt tracking stays in sync with purchases.

32. As a user, I want to see all unpaid invoices for a supplier, so that I know how much I owe them.

33. As a user, I want to edit a DRAFT invoice, so that I can correct mistakes before receiving the goods.

34. As a user, I want to delete a DRAFT invoice, so that I can remove invoices I created by mistake.

35. As a user, I want to see the total amount of an invoice calculated automatically from line items, so that I don't need to do mental math.

36. As a user, I want to see invoice history with dates and amounts, so that I can review my purchasing patterns.

37. As a developer, I want invoice creation to be a transactional operation, so that line items and debt entries are created atomically.

### Payment Processing Stories

38. As a user, I want to record a payment when I pay a supplier, so that my debt balance reflects the payment.

39. As a user, I want to specify the payment method (CASH, BANK_TRANSFER, CHECK), so that I can track how I paid.

40. As a user, I want to allocate a single payment across multiple invoices, so that I can record partial payments accurately.

41. As a user, I want the system to prevent over-allocation (paying more than the invoice balance), so that I don't accidentally overpay.

42. As a user, I want to see how much I've paid against each invoice, so that I know the remaining balance.

43. As a user, I want debt accounts to update automatically when payments are allocated, so that my debt tracking stays accurate.

44. As a user, I want to see payment history for a supplier, so that I can review past payments.

45. As a user, I want to see the total amount paid vs total amount owed for each supplier, so that I know my net position.

46. As a user, I want to delete a payment that was recorded by mistake, so that I can correct errors (only if no allocations exist).

47. As a developer, I want payment allocation to be transactional, so that debt balances never become inconsistent.

48. As a developer, I want payment operations to support concurrency, so that two users can record payments simultaneously without data corruption.

### Pagination Stories

49. As a user, I want to see the first 50 employees in a list, so that the page loads quickly.

50. As a user, I want to click "Next" to see the next 50 employees, so that I can browse through large datasets.

51. As a user, I want to click "Previous" to go back to the previous 50 employees, so that I can review earlier results.

52. As a user, I want to see the total count of records, so that I know how many items exist.

53. As a user, I want pagination to be consistent even when new records are added, so that I don't see duplicates or miss records.

54. As a developer, I want pagination to use cursor-based logic (not offset), so that performance is consistent regardless of page number.

55. As a developer, I want pagination to work across all list endpoints (employees, projects, warehouses, debts, invoices, payments, inventory), so that the UX is consistent.

56. As a developer, I want pagination cursors to be opaque tokens, so that implementation details can change without breaking clients.

### Testing Stories

57. As a developer, I want integration tests for the employee lifecycle (create → assign to project → record salary → terminate), so that cross-domain workflows are verified.

58. As a developer, I want integration tests for the invoice-to-payment flow (create invoice → receive → record payment → verify debt updated), so that the financial workflow is verified.

59. As a developer, I want integration tests for inventory transfer (move items from warehouse to project → verify quantities updated → verify movement history), so that the inventory workflow is verified.

60. As a developer, I want unit tests for each module using InMemory adapters, so that tests run in milliseconds without database overhead.

61. As a developer, I want tests to follow the pattern "arrange, act, assert" with clear naming, so that they serve as documentation.

62. As a developer, I want tests to cover edge cases (empty inputs, invalid data, concurrent operations), so that the system is robust.

63. As a developer, I want test coverage reports, so that I can identify untested code paths.

64. As a developer, I want tests to be deterministic, so that they don't fail intermittently.

### Portable App Stories

65. As an entrepreneur, I want to run the application from a USB drive, so that I can use it on any computer without installation.

66. As an entrepreneur, I want my data stored next to the application, so that I can take my data with me when I move computers.

67. As an entrepreneur, I want the encrypted database to work with the portable app, so that my data is secure even on a USB drive.

68. As an entrepreneur, I want to back up my data by copying the database file, so that I have a recovery option if something goes wrong.

69. As an entrepreneur, I want to restore from a backup by replacing the database file, so that I can recover from data loss.

70. As a developer, I want the portable build process to include the encrypted database driver, so that the app works without requiring system-level SQLite installation.

---

## Implementation Decisions

### Architecture Decisions

- **ORM Choice**: Drizzle ORM replaces Prisma for all database access. Drizzle provides TypeScript-native queries without code generation and works with `better-sqlite3-sqlcipher` as a drop-in driver.

- **Database Encryption**: SQLCipher via `better-sqlite3-sqlcipher` provides full database encryption. The encryption key is derived from the user's bootstrap setup key, ensuring each installation has a unique encryption boundary.

- **Module Architecture**: Domain modules replace the monolithic `CompanyService`. Each module has a small public interface (5-10 methods) and a deep implementation. Modules follow the pattern: `interface` (what callers see) + `adapters/` (production + test implementations).

- **Adapter Pattern**: Two adapters per module:
  - `DrizzleXxxRepository` - Production adapter using Drizzle ORM
  - `InMemoryXxxRepository` - Test adapter using in-memory Map storage
  - This enables fast tests without database setup.

- **Update ADR-001**: The existing ADR states "Prisma for auth, raw SQL for business domains." This needs to be updated to reflect: "Drizzle ORM for all data access. Better Auth uses its own Drizzle adapter."

- **Test Seams**: 
  - Highest seam: oRPC contract boundary (tests via HTTP-like calls)
  - Second seam: Module public interface (tests via direct module calls with InMemory adapters)
  - Lowest seam: Individual adapter methods (rarely needed)
  - Tests should use the highest seam possible.

### Schema Changes

- **New Tables**:
  - `role` - Role definitions (already exists, may need permission linkage)
  - `permission` - Permission definitions
  - `role_permission` - Many-to-many between roles and permissions
  - `user_role` - User-to-role assignments
  - `invoice` - Invoice headers
  - `invoice_line_item` - Invoice line items
  - `payment` - Payment records
  - `payment_allocation` - Allocation of payments to invoices

- **Modified Tables**:
  - `user` - Already exists, no changes needed
  - `employee` - No schema changes, behavior changes via module refactor
  - `project` - No schema changes
  - `warehouse` - No schema changes
  - `debt_account` - May need `linked_invoice_id` to link invoices
  - `inventory_entry` - Already supports invoice linkage

- **New Indexes** (based on query analysis):
  - All foreign keys (`role_id`, `manager_id`, `worker_id`, etc.)
  - Status columns (`status`)
  - Date columns used for sorting (`created_at`, `payment_date`, `entry_date`)
  - Composite indexes for common query patterns

### API Contract Changes

- **New Endpoints** (added to `packages/contracts`):
  - `invoices.list`, `invoices.create`, `invoices.update`, `invoices.delete`
  - `invoices.receive` (transition to RECEIVED status, create debt)
  - `payments.list`, `payments.create`, `payments.allocate`, `payments.delete`
  - `roles.list`, `roles.create`, `roles.update`, `roles.delete`
  - `permissions.list`, `permissions.assign`, `permissions.revoke`

- **Modified Endpoints** (add pagination input):
  - `employees.list` - Add `cursor` and `limit` parameters
  - `projects.list` - Add pagination
  - `warehouses.list` - Add pagination
  - `debts.list` - Add pagination
  - `inventory.list` - Add pagination

- **Pagination Contract**:
  ```
  Input: { cursor?: string, limit?: number (default 50, max 100) }
  Output: { items: T[], nextCursor?: string, hasMore: boolean, total: number }
  ```

### Module Structure

```
src/modules/
├── workforce/
│   ├── employee.module.ts           # Public interface (5-10 methods)
│   ├── employee.types.ts            # Input/output types
│   └── adapters/
│       ├── drizzle-employee.repository.ts
│       └── in-memory-employee.repository.ts
├── operations/
│   ├── project.module.ts
│   ├── warehouse.module.ts
│   └── adapters/
├── finance/
│   ├── debt.module.ts
│   ├── invoice.module.ts
│   ├── payment.module.ts
│   └── adapters/
├── inventory/
│   ├── inventory.module.ts
│   └── adapters/
└── permissions/
    ├── role.module.ts
    ├── permission.module.ts
    └── adapters/
```

### Permission System Design

```
Default Roles:
├── ADMIN    - All permissions
├── MANAGER  - employees:*, projects:*, warehouses:*, inventory:*, debts:read
└── VIEWER   - All entities:read

Custom Roles:
├── Admins can create custom roles
├── Admins can toggle individual permissions per role
└── Future: Migrate to full permission-based system
```

### Invoice Workflow

```
States: DRAFT → RECEIVED → PAID
        DRAFT → (deleted)

Transitions:
- DRAFT → RECEIVED: Creates debt account entry, updates inventory
- RECEIVED → PAID: Triggered when allocations cover full amount
- DRAFT: Can be edited or deleted
- RECEIVED/PAID: Cannot be edited (only viewed)
```

### Payment Allocation Logic

```
Input: { paymentAmount, allocations: [{ invoiceId, amount }] }

Validation:
- Sum of allocations must equal payment amount
- Each allocation must not exceed invoice remaining balance
- All invoices must exist and belong to the same supplier

On Success:
- Create payment record
- Create allocation records
- Update invoice paid amounts
- Update debt account balance
```

---

## Testing Decisions

### What Makes a Good Test

A good test:
- **Tests behavior, not implementation** - Tests should verify what the module does, not how it does it
- **Uses the public interface** - Tests should not access private methods or internal state
- **Is deterministic** - Same input always produces same output
- **Is independent** - Tests should not depend on other tests
- **Has clear naming** - Test names should describe the scenario being tested
- **Follows Arrange-Act-Assert** - Structure tests for readability
- **Tests one thing** - Each test should verify a single behavior

### Test Layers

**Layer 1: Module Unit Tests (with InMemory adapters)**
- Fast (no I/O)
- Test business logic in isolation
- Use InMemory adapters
- Example: "creates an employee with valid input"

**Layer 2: Integration Tests (with InMemory adapters)**
- Test cross-module workflows
- Use multiple InMemory adapters together
- Example: "create employee → assign to project → record salary"

**Layer 3: Drizzle Adapter Tests (with in-memory SQLite)**
- Test that Drizzle adapters correctly map to database
- Use `better-sqlite3` in `:memory:` mode
- Example: "DrizzleEmployeeRepository.findById returns the correct record"

**Layer 4: E2E Tests (with full stack)**
- Test through the RPC boundary
- Use the actual server and database
- Slowest, but covers integration issues
- Example: "user can create an invoice via the API"

### Prior Art in Codebase

Existing tests in `apps/api/src/` provide patterns:
- `apps/api/src/modules/account/account.service.test.ts` - Service unit tests with mocked dependencies
- `apps/api/src/infrastructure/rate-limiter.test.ts` - Infrastructure tests
- `apps/api/src/app/create-app.test.ts` - App-level integration tests

The new tests should follow similar patterns but use InMemory adapters instead of mocks where possible, as InMemory adapters test more realistic behavior.

### Test Coverage Targets

- **Module interfaces**: 100% coverage of public methods
- **Critical paths**: 90%+ coverage (invoice creation, payment allocation, permission checks)
- **Edge cases**: All identified edge cases covered
- **Error paths**: All error scenarios tested

### Query Optimization Tests

For each migrated query:
1. Run `EXPLAIN QUERY PLAN` before optimization
2. Document the plan (SCAN TABLE vs SEARCH TABLE USING INDEX)
3. Add indexes if needed
4. Run `EXPLAIN QUERY PLAN` after optimization
5. Document the improvement

---

## Out of Scope

The following items are explicitly out of scope for this PRD:

1. **Multi-tenant support** - The application supports a single organization per installation.

2. **Cloud synchronization** - The application runs entirely offline. No cloud sync.

3. **Mobile app** - Desktop only. Mobile apps are a future consideration.

4. **Barcode/QR scanning** - Inventory tracking is manual entry only.

5. **Email notifications** - No email or SMS notifications.

6. **Advanced reporting** - Basic lists are sufficient. Custom reports are future work.

7. **Multi-currency support** - All amounts are in Algerian Dinar (DZD).

8. **Tax calculations** - Tax handling is out of scope.

9. **Approval workflows** - Simple permission checks only. Multi-step approvals are future work.

10. **Audit log UI** - Audit logging exists in the database, but a dedicated UI is not part of this PRD.

11. **Backup automation** - Users manually copy database files. Automated backups are future work.

12. **Performance under 100k+ records** - The system is optimized for typical construction business scale (hundreds to thousands of records per entity).

13. **Accessibility audit** - Basic accessibility is maintained, but a full WCAG audit is not in scope.

14. **Internationalization expansion** - Arabic and English are supported. Adding more languages is future work.

---

## Further Notes

### Risk Mitigation

**Risk: Drizzle migration breaks existing functionality**
- Mitigation: Run full test suite before and after migration. Create integration tests for all critical paths before starting migration.

**Risk: SQLCipher doesn't work in portable Tauri app**
- Mitigation: Test the portable build early in Phase 1. Have a fallback plan to use field-level encryption if SQLCipher fails.

**Risk: Performance regressions from ORM change**
- Mitigation: Run `EXPLAIN QUERY PLAN` on all queries. Add indexes based on findings. Benchmark before and after.

**Risk: Test coverage doesn't improve significantly**
- Mitigation: Set explicit coverage targets. Require tests for all new features. Use coverage reports in CI.

**Risk: Refactor introduces bugs**
- Mitigation: Migrate one module at a time. Keep existing tests passing throughout. Add new tests for new behavior.

### Success Criteria

- [ ] All data encrypted at rest (SQLCipher verification)
- [ ] Deep modules with small interfaces implemented
- [ ] InMemory adapters work for all modules
- [ ] All new features have tests (TDD workflow followed)
- [ ] Query optimization documented with EXPLAIN results
- [ ] Role-based permissions enforced on all mutations
- [ ] Invoice management functional (create, receive, pay)
- [ ] Payment allocation working across multiple invoices
- [ ] Cursor-based pagination on all list endpoints
- [ ] 80%+ test coverage on critical paths
- [ ] Portable Tauri app builds successfully with encrypted database

### References

- ADR-001: `docs/architecture-decisions.md` (needs update)
- Refactoring plan: `plans/REFACTORING_TASKS.md` (already exists, aligns with this PRD)
- System analysis: `SYSTEM_FEATURES_ANALYSIS.md`
- Code review: `CODE_REVIEW.md`
- Architecture improvements: `ARCHITECTURE_IMPROVEMENTS.md`
