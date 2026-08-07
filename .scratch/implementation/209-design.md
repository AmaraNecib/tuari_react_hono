# Issue #209 — RBAC persistence follow-ups: align module layout with adapters/, drop raw-handle constructor

## Context

Issue #197 extracted `PermissionResolverPort` from `SqlitePermissionResolver`; the
adapter landed in `modules/rbac/adapters/`. Two follow-ups remain (deferred from
#197, part of the #191 persistence-boundary refactoring):

1. **Adapter layout alignment** — `modules/rbac/sqlite-role.repository.ts` still
   lives at the rbac module root while the permission-resolver adapter sits in
   `modules/rbac/adapters/`. The rbac storage adapters should share one search
   surface (`adapters/`), matching every other module in the app
   (`workforce/adapters/`, `company/adapters/`, `invoice/adapters/`, ...).
2. **Drop the raw-handle constructor mode** — `SqlitePermissionResolver` still
   accepts `BetterSqliteDatabase | { exec }` and force-casts to build its own
   Drizzle instance. The composition root already builds a shared `AppDrizzle`;
   the resolver should take it directly (removes the raw-handle leakage #191
   targets).

Both are **no-behavior-change** structural cleanups. Review tier: **High-assurance**
(RBAC/authz files are touched, per the workflow tier table).

## Decision: what moves, what stays

- `modules/rbac/sqlite-role.repository.ts` → **moves** to
  `modules/rbac/adapters/sqlite-role.repository.ts` (it is the SQL storage
  adapter; the `SqliteRoleRepository` class is analogous to
  `workforce/adapters/role.repository.ts`).
- `InMemoryRoleRepository` (the in-memory test double, previously embedded in
  `role.module.ts`) → **moves** to
  `modules/rbac/adapters/in-memory-role.repository.ts`. Every other module
  keeps its in-memory doubles under `adapters/`
  (`workforce/adapters/in-memory-role.repository.ts`, `company/adapters/inmemory-*`);
  rbac was the only module with its double embedded in the module file.
  All rbac storage adapters (sqlite + in-memory) now share one search surface.
- `modules/rbac/role.module.ts` → **stays** at the module root. It is the deep
  module (`RoleModule` + the `RoleRepository` seam), not a storage adapter.
  Every other module keeps its deep module at the root
  (`employee.module.ts`, `invoice.module.ts`, `payment.module.ts`, ...). The
  seam (interface) stays with the deep module, mirroring `company.repository.ts`
  at the company module root with its implementations in `adapters/`.

## Public API / component interfaces

No public surface changes. Internal signatures:

- `SqliteRoleRepository` — unchanged class, new module path
  `modules/rbac/adapters/sqlite-role.repository.ts` (imports re-relative'd).
- `SqlitePermissionResolver` — constructor narrows from
  `(rawDb: BetterSqliteDatabase | { exec }, authBootstrap, drizzleDb?)` to
  `(db: AppDrizzle, authBootstrap)`.
  - The `private readonly db` field becomes a parameter property.
  - Removed imports: `createDrizzleFromSqlite`, `BetterSqliteDatabase`.
- `createAppDependencies` — passes the pre-built `db` (AppDrizzle) instead of
  the raw handle: `new SqlitePermissionResolver(db, authBootstrapService)`.
  This satisfies the issue's precondition ("once the composition root always
  passes a pre-built AppDrizzle"). The pre-built `db` is constructed from the
  same shared handle (`drizzleDb ?? createDrizzleFromSqlite(sharedDatabase)`),
  so the resolver still queries the single shared connection — identical
  runtime behavior (better-sqlite3 is one synchronous connection).

## Dependencies

- None new. Removed coupling: `SqlitePermissionResolver` no longer imports
  `createDrizzleFromSqlite` / `BetterSqliteDatabase`.

## Planned tests

- **Unit (vitest)**:
  - Update `modules/rbac/adapters/sqlite-permission-resolver.test.ts` to the new
    constructor (`db` first, no raw-handle arg) — keeps the 4 existing behavior
    tests (user perms, empty, bootstrap-owner all-perms, dedupe) green.
  - **New** `modules/rbac/adapters/sqlite-role.repository.test.ts` pinning the
    moved adapter's behavior (it is currently untested — only the in-memory
    double is exercised by `role.module.test.ts`): `findAll` grouping + ordering,
    `findById` / `findByKey` hits and null misses (including the `where`
    predicate on the correct column), LEFT-JOIN null permission → empty
    permission list (for all three readers), and the `isPermission` guard
    skipping legacy dot-separated rows. Uses the same mock-drizzle-chain pattern
    as the resolver test — no real DB needed.
  - Existing `InMemoryRoleRepository` consumers (`role.module.test.ts`,
    `rpc/handlers/rbac.test.ts`, `rpc/router.test.ts`) repointed at
    `adapters/in-memory-role.repository` — no assertion changes.
- **Playwright E2E**: none new — this is an API-only, no-behavior-change
  refactor with no user-facing surface. Existing `tests/e2e/` suites must remain
  unaffected (no web files change).
- Full gates: `pnpm --filter @tuari/contracts build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test:api`, `pnpm test:web`.

## Implementation risks

- **Import-path drift in the moved file**: 5 relative imports change depth
  (`../../` → `../../../`, `./` → `../`). Mitigated by `pnpm typecheck` +
  `test:api` (only `dependencies.ts` imports the adapter; the tests compile the
  whole graph).
- **Missed constructor call sites**: the resolver is constructed in exactly two
  places (`dependencies.ts`, its own test) — verified by grep; typecheck will
  catch any straggler.
- **Drizzle double-instance concern (dismissed)**: previously the resolver
  created its own Drizzle from the raw handle; now it shares the composition
  root's single instance. better-sqlite3 is one synchronous connection, so a
  second Drizzle instance was never a second connection — no behavior delta on
  the default path. One intended nuance: when a caller injects `drizzleDb`
  built over a different handle than `sqlite`, the resolver now routes through
  the injected instance (previously it ignored the injected instance and built
  its own from the handle). That is the point of the change — the composition
  root owns one Drizzle instance and every consumer uses it.
- **Test-audit scope creep**: adding the adapter tests is justified as the
  move's behavior pin; they are small and follow the existing mock pattern.

## Deviations from architecture

None — this aligns the module with the established ports & adapters convention.
