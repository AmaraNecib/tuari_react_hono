# #266 Code review evidence (inline, child-agent execution)

Head SHA: `f0367e0` · Base SHA: `9aac620` · Tier: High-assurance
Reviewed diff: `git diff 9aac620...f0367e0` (4 files, +91/-30) by the
implementing agent in lieu of a separate `code-review` subagent (child
agents cannot spawn subagents in this environment).

## Findings

### sqlite-role.repository.ts — groupRoles dedup
- ✅ Per-role `Set<string>` scopes dedup correctly; two roles sharing a
  permission both keep it.
- ✅ First-seen order preserved → matches query `ORDER BY permission` and the
  existing order-pinning test.
- ✅ Null / empty / invalid permission rows still skipped before the Set
  check; no behavior change for canonical data.
- ✅ Bucket map is module-local; public shape (`RoleWithPermissions`) and the
  `RoleRepository` interface unchanged.
- Minor: the `{ role, seenPermissions }` bucket wrapper adds indirection vs a
  plain map, but keeps the dedup set out of the returned objects — accepted
  trade-off for a flat structure without a hidden field.

### sqlite-permission-resolver.ts — isPermission filter
- ✅ Filter applied before insertion into the dedup `Set`; return type and
  first-seen ordering unchanged.
- ✅ `isPermission` type predicate narrows `row.permission` to `Permission`
  (typecheck clean); the explicit `as Permission[]` on the spread is
  redundant-but-harmless and self-documents the result type.
- ✅ Bootstrap-owner short-circuit untouched (still returns a fresh
  `ALL_PERMISSIONS` copy before any row handling).
- ✅ Import stays within `modules/rbac/permissions` — no new dependencies.

### Tests
- ✅ Red→green verified for all three changed/added test expectations.
- ✅ The #210 pin flip is explicitly documented in the test comment and the
  PR body — no silent contract change.
- ✅ No flaky/mocked-SQL drift: chain mocks unchanged, only the fixture rows
  differ.

## Blockers

None.

## Non-blocking observations

- The resolver and repository now share the same guard, but the guard call
  itself is duplicated at two call sites. Extraction into a shared helper
  would be possible; the issue's scope is hardening, not abstraction — left
  as-is to keep the diff minimal. (Not a blocker; noted for future work.)

## Verdict

Approve. Change is minimal, well-tested, and consistent with the issue's
approved direction.
