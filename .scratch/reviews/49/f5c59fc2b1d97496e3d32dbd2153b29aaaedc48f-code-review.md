# Issue #49 follow-up review evidence

Base: `origin/develop` at `0165b7e208cb8054f2cdf23f2801aa1fd774fd57`
Reviewed commits: `19b4042`, `29d9c53`, `f5c59fc` (HEAD at review time)
Review command: `git diff origin/develop...HEAD`

## What the follow-ups fix

1. PR #51 hosted review (4/5): the edit page submitted load-time relationship snapshots on every save, so a stale profile-only save could revert newer concurrent placement or managed-scope changes. Fix: relationship fields in `employeesSave` are optional; the page submits only controls the user actually edited; the server skips absent fields. API tests prove a newer concurrent placement and managed-scope update survive a stale profile-only save.
2. Greptile CLI review of the first follow-up (P1): a rejected atomic batch was treated as partially persisted, reloading old data over the user's typed edits with a misleading banner. Fix: rejection keeps every typed value, shows only the nothing-saved banner, and does not refetch. The now-dead client-side per-step rollback helpers were removed; all-or-nothing behavior is covered by the API transaction rollback tests.

## Greptile CLI

- Round 1 (`greptile review --json --branch develop` after `19b4042`): confidence 4, one P1 comment on `employee-edit-page.tsx` (atomic rollback discards form edits). Addressed by commit `f5c59fc`.
- Round 2 (after `f5c59fc`): confidence 5, zero comments, "no blocking failure remains".

## Local two-axis subagent review (fresh reviewers)

- Standards: no blocker. Fixed after review: broken indentation on two inline `onChange` handlers, a stale "rollback" comment, and unused `savePartialRolledBack` / `savePartialUnverified` i18n keys. Remaining notes accepted as-is: dirty flags stay set when a control is reverted to its original value (conservative; submitted values equal what the user sees), and the in-memory store's snapshot rollback relies on repositories reading tables through the store each call (documented invariant).
- Spec: no blocker. All five requested properties verified: opt-in relationship fields end to end, transactional atomicity, #20 inactive-placement rule, rejected-batch UX, and regression coverage for each.

## Local verification

- `pnpm --filter @tuari/contracts build` passed.
- `pnpm --filter @tuari/api test:coverage` passed: 1,261 passed, 1 skipped, 100% statements, branches, functions, and lines.
- `pnpm --filter @tuari/web test` passed: 624 passed (net -10 from removing obsolete reconcile unit tests and adding stale-save regression cases).
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- No Playwright or e2e was run. Hosted PR review will run automatically after push.
