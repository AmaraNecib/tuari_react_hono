# #266 Test audit evidence (inline, child-agent execution)

Head SHA: `f0367e0` · Base SHA: `9aac620`
Executed inline by the implementing agent (child agents cannot spawn the
`test-audit` subagent in this environment).

## Scope

Change is confined to read-path hardening in two RBAC adapters. No
user-facing flow changes and no Playwright E2E impact: the UI cannot
observe dirty `role_permission` rows (canonical seeds/migrations only), and
the issue is explicitly a no-behavior-change refactor for canonical data.
E2E therefore not applicable — noted, not skipped.

## Coverage checks

### sqlite-role.repository.test.ts
- **New** — deduplicates repeated `(role, permission)` rows, first-seen order
  preserved, across two roles sharing a permission. Covers the duplicate-row
  dirty-data case with an in-order assertion.
- Existing guards still exercised: dot-form skip, unknown resource/action
  skip, empty-string permission, LEFT-JOIN miss, isSystem mapping, order-by
  clause pinning, findAll/findById/findByKey paths.

### sqlite-permission-resolver.test.ts
- **Updated** — #210 pass-through pin inverted to the filter behavior:
  stale (`employees:removed`), legacy dot-form (`employees.create`) and
  multi-colon (`employees:create:extra`) rows are all filtered; the one
  canonical row survives. Covers the exact three dirty-row families the
  issue names.
- **New** — combined filter+dedup test: duplicates among canonical strings
  still collapse while dot-form is dropped.
- Existing tests green: bootstrap owner short-circuit (incl. no-DB-call),
  empty result, canonical dedup, fresh-copy isolation, empty userId.

### Broader suites
- `src/modules/rbac` + `src/modules/session`: 6 files, 69 tests pass.
- Full API suite: 58 files, 950 tests pass.
- Web suite (guard): 48 files, 375 tests pass.

## Quality assessment

- Assertions are meaningful (exact array equality on order + content), not
  smoke checks.
- Edge states covered: empty results, unknown/stale strings, legacy format,
  malformed multi-colon, duplicates, multi-role overlap, bootstrap path.
- No shallow tests added; both new tests fail against the pre-fix code
  (verified red before green).

## Verdict

Coverage adequate for the change surface. No gaps found.
