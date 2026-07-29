# Tickets: #177 remaining decomposition

Follow-up work for issue #177 — complete the decomposition of CompanyService and CompanyRepository that PR #179 left partial.

## 177-1: Switch domain services to focused repository interfaces

**What:** Change `workforce.service.ts` → `WorkforceRepository`, `operations.service.ts` → `OperationsRepository`, `finance.service.ts` → `FinanceRepository`, `audit.service.ts` → `AuditRepository` instead of the broad `CompanyRepository`.

**Blocked by:** None — interfaces already exist.

## 177-2: Split `SqliteCompanyRepository` into per-domain implementations

**What:** Create `SqliteWorkforceRepository`, `SqliteOperationsRepository`, `SqliteFinanceRepository`, `SqliteAuditRepository` classes. The old combined class becomes a thin delegation or is removed.

**Blocked by:** 177-1 (interfaces need clean consumers first).

## 177-3: Add InMemory adapters for faster tests

**What:** Create `InMemoryWorkforceRepository`, `InMemoryOperationsRepository`, `InMemoryFinanceRepository`, `InMemoryAuditRepository` following the pattern in `modules/workforce/adapters/`.

**Blocked by:** 177-2 (implementation classes need to exist first).

## 177-4: Greptile review + cleanup

**What:** Submit PR for Greptile review, fix any findings.

**Blocked by:** 177-1, 177-2, 177-3.
