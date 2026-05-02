# Architecture Decisions

## ADR-001 — Persistence boundary: Prisma for auth, raw SQL for business domains

**Status:** Accepted  
**Date:** 2026-04-29

### Decision

Use Prisma only for better-auth-managed account/session tables and account profile operations. Use explicit `better-sqlite3` SQL repositories for business-domain models such as workforce, projects, warehouses, debts, inventory, and audit logs.

### Rationale

- better-auth owns and evolves the auth-related Prisma schema, so keeping account/session access in `AccountRepository` aligns with that integration.
- Business-domain operations require transaction shapes, audit logging, rollbacks, and reporting queries that are easier to reason about with explicit SQL.
- The split keeps authentication concerns isolated from operational business data and avoids mixing two data access styles inside the same domain.

### Consequences

- New auth/account persistence belongs in `apps/api/src/modules/account/account.repository.ts`.
- New business-domain persistence belongs in the relevant raw SQL repository (`company.repository.ts`, `inventory.repository.ts`, or a future domain repository).
- Repository tests must cover both styles at their boundaries.
- Contributors should not add workforce, inventory, debt, project, warehouse, or audit-log persistence to Prisma models unless this ADR is superseded.
