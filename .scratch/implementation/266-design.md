# #266 Design — RBAC data-integrity hardening

Tier: **High-assurance** (authz/permissions)
Base SHA: `9aac6209735090c86fb5275278619ccbd154ee46` (origin/develop)
Branch: `refactor/issue-266-rbac-integrity`

## Decision record

Issue #266 lists three dirty-data handling gaps in `apps/api/src/modules/rbac/`.
The decision requested: *"dedup + filter in the adapters, or tighten the guard."*

| # | Gap | Decision | Where |
|---|-----|----------|-------|
| 1 | `groupRoles` does not deduplicate `(role, permission)` rows | **Dedupe in the adapter** (repository is the storage boundary; a `Set` per role keeps first-seen order, matching the query `ORDER BY permission`) | `adapters/sqlite-role.repository.ts` |
| 2 | `SqlitePermissionResolver.getPermissionsForUserId` passes unguarded strings through | **Filter in the adapter** with `isPermission`, matching the role repository's read path so legacy dot-form / stale strings cannot leak into `Permission[]` | `adapters/sqlite-permission-resolver.ts` |
| 3 | `isPermission` accepts multi-colon strings | **Already fixed at HEAD** — commit `7d34ccb` (#290) added the exactly-one-colon guard (`extra.length > 0` → false) plus pinned tests. No code change in this PR; documented only. | `permissions.ts` (no-op) |

Rationale: the two read adapters must agree on the same canonical-form gate.
The repository already guards rows; the resolver previously did not. Both are
defense-in-depth: `role_permission` has a surrogate `id` primary key with **no
unique constraint on `(role_id, permission)`**, so duplicate rows can exist at
rest, and legacy/dirty strings can survive until the normalisation migration
runs. Neither path is a live exploit (seeds/migrations write canonical
colon-form); both changes are strictly read-time hardening with no behavior
change for canonical data.

## Public API / interfaces

- `RoleRepository`, `RoleWithPermissions`, `PermissionResolverPort` — **unchanged**.
- `groupRoles` (module-private helper in `sqlite-role.repository.ts`) — now
  deduplicates permissions per role while preserving first-seen order.
- `SqlitePermissionResolver.getPermissionsForUserId` — now filters rows through
  `isPermission` before dedup; return type and ordering semantics unchanged.

## Dependencies

- None. No new packages, no lockfile change. `isPermission` already imported
  by the repository; added to the resolver's imports.

## Planned tests

- `adapters/sqlite-role.repository.test.ts`
  - new: duplicate `(role, permission)` rows collapse to one entry, order preserved
- `adapters/sqlite-permission-resolver.test.ts`
  - update: the #210 pass-through pin flips — stale/unknown colon-form and
    legacy dot-form rows are now filtered out (comment anticipated this exact
    flip: "if the resolver gains an isPermission() filter, this expectation
    flips to []").
  - existing dedup test (canonical strings) must stay green.
- No Playwright E2E: no user-facing flow changes (no-behavior-change refactor
  for canonical data); the UI cannot observe dirty rows, and the change is
  backend read-path hardening.

## Risks

- **Ordering regression**: dedup must preserve first-seen order. Mitigated by
  using `Set` per role and pushing only on first sight.
- **Contract flip (#210 pin)**: the resolver pass-through pin is deliberately
  inverted per this issue's decision; downstream consumers (session service)
  only forward the resolved list, so no consumer relies on unknown strings.
- **Scope**: changes limited to `apps/api/src/modules/rbac/**` (+ its tests).
