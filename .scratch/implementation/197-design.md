# Extract PermissionResolverPort from SqlitePermissionResolver

**Issue:** #197
**Part of:** #191 (Persistence Boundary Refactoring)
**Tier:** High-assurance (RBAC/permissions)
**Base SHA:** `80d4926` (merge-base with `origin/develop`)
**Design Date:** 2026-08-03

## Objective

`SqlitePermissionResolver` currently depends on `BetterSqliteDatabase` and the
app schema directly, and creates its own Drizzle instance from a raw handle.
Split it into a port and an adapter so consumers (SessionService) depend on the
port interface, following the ports & adapters pattern established in #177.
**No behavior changes** — this is a structural refactor only.

## Public API

### New: `apps/api/src/modules/rbac/permission-resolver.types.ts`

```typescript
import type { Permission } from "./permissions";

export interface PermissionResolverPort {
  getPermissionsForUserId(userId: string): Promise<Permission[]>;
}
```

The single-method port is the seam. Consumers (SessionService) depend on this
interface; adapters (SqlitePermissionResolver, future in-memory resolver)
implement it. `Permission` is already the RBAC domain type from `permissions.ts`.

### New: `apps/api/src/modules/rbac/adapters/sqlite-permission-resolver.ts`

The `SqlitePermissionResolver` class moves verbatim (implementation unchanged,
constructor signature unchanged — it still accepts the raw SQLite handle and
optional pre-built `AppDrizzle`, creating its own Drizzle instance when none is
passed). It now sits under `adapters/` next to the other storage adapters in
the codebase (workforce, invoice, payment, company patterns).

### Updated: `apps/api/src/modules/session/session.service.ts`

Replace the private structural `type PermissionResolver = { getPermissionsForUserId: ... }`
with the imported `PermissionResolverPort`. The two are structurally identical,
so `SessionService`'s behavior and its mock-based tests are unchanged.

### Updated: `apps/api/src/app/dependencies.ts`

Import `SqlitePermissionResolver` from `../modules/rbac/adapters/sqlite-permission-resolver`
instead of `../modules/rbac/permission-resolver`.

### Moved: `apps/api/src/modules/rbac/permission-resolver.test.ts`
→ `apps/api/src/modules/rbac/adapters/sqlite-permission-resolver.test.ts`

Tests sit next to their subject (repo convention: adapter tests live in
`adapters/`, e.g. `workforce/adapters/in-memory-employee.repository.test.ts`).
Only the import path changes; test logic is untouched.

### Deleted: `apps/api/src/modules/rbac/permission-resolver.ts`

## Dependencies

```
permission-resolver.types.ts  → permissions.ts (type-only)
adapters/sqlite-permission-resolver.ts → drizzle-orm, schema, drizzle factory,
                                         permissions.ts, permission-resolver.types.ts
session.service.ts            → permission-resolver.types.ts (type-only)
dependencies.ts               → adapters/sqlite-permission-resolver.ts
```

No circular dependencies. The port lives in the rbac module root next to its
domain types; the adapter lives in `adapters/`.

## Planned tests

- **Unit (existing, unchanged):** `adapters/sqlite-permission-resolver.test.ts`
  covers permissions resolution, empty result, bootstrap-owner all-permissions
  short-circuit, and deduplication. `session.service.test.ts` covers the
  session flow with a mock resolver (structurally satisfies the port).
- **E2E (existing, unchanged):** `tests/e2e/foundation-smoke.spec.ts` +
  `tests/e2e/*.spec.ts` exercise login → session → permission-gated UI through
  the real app, which wires the adapter at the composition root.

No new tests: the issue explicitly requires "no behavior changes; existing tests
pass unchanged". The moved adapter test and the session tests already pin the
port contract structurally (SessionService accepts any object with
`getPermissionsForUserId`).

## Implementation risks

- **Unused import lint failure** — `session.service.ts` drops its local type,
  so `import type { Permission } from "../rbac/permissions"` becomes unused and
  must be removed in the same edit.
- **Missed importers** — only `dependencies.ts` and the test import the old
  path; verified by repo-wide grep before starting.
- **No behavior change** — the adapter body is moved verbatim; the test suite
  (unit + E2E) must stay green with zero test-logic edits.

## Acceptance criteria mapping

| Criterion | Where |
|-----------|-------|
| Port in `modules/rbac/permission-resolver.types.ts` | new file |
| Adapter in `modules/rbac/adapters/sqlite-permission-resolver.ts` | new file |
| SessionService depends on the port | `session.service.ts` constructor |
| All imports updated | `dependencies.ts`, moved test |
| Compiles with no errors | `pnpm typecheck` + `@tuari/api` build |
| Existing tests pass unchanged | `pnpm test:api`, `pnpm test:web` |
