# #428 / PR #438 — verification evidence (`0a70d5d7`)

- base: `develop` @ `3b75e579` (rebased; pre-rebase base was `edf1e5b3`)
- branch/worktree: `fix/428-datepicker-audit` · `worktrees/fix-datepicker-audit`
- final code commit reviewed: `0a70d5d7` (round-3 code `146c7d71` +
  #440 test commit `0a70d5d7`; pre-rebase head was `bce57a45`)
- review tier: Standard, escalated to the brief's aggressive local review
  (debate + code-review + test-audit) because the hosted Greptile gate is
  unavailable and this lane is the merge gate.
- re-pinned after rebasing onto the moved `origin/develop` (daily-backup
  feature, #434) and after the parent's #440 decision.

## Commands and results (worktree root)

| Command | Result |
|---|---|
| `pnpm --filter @tuari/contracts build` (stale `dist` before checks) | PASS |
| `pnpm --filter @tuari/web exec vitest run --maxWorkers=2 <12 touched suites>` | PASS — 12 files, 112 tests |
| `pnpm --filter @tuari/web test --maxWorkers=2` (full, final) | PASS — 81 files, 680 tests |
| `pnpm typecheck` (root, turbo) | PASS — 4/4 tasks |
| `pnpm lint` (root, turbo) | PASS — 2/2 tasks |
| `pnpm check:unslop` | PASS — 0 error / 1661 warn (+2 from develop's #434 backup docs, none from this branch) |
| scoped v8 coverage `src/lib/date-range.ts` | 100% stmts (24/24), 100% branch (19/19), 100% funcs (5/5), 100% lines (19/19) |
| scoped v8 coverage `src/features/audit/audit-log-page.tsx` | 56.6% stmts / 60.7% branch (pre-existing file; only the new range block is covered) |

No E2E spec exists for this PR (no `tests/e2e/` file in the diff), so none was
run. The full web suite was run twice (once pre-rebase, once post-rebase); the
first pre-rebase run exposed the report-builder 5s timeout under load, which is
now an explicit 15s.

## What changed in `146c7d71` (round-3 review fixes)

1. **Range seam hardened** (`apps/web/src/lib/date-range.ts`):
   - `resolveDayRangeBounds` validates each non-blank bound is a real canonical
     `yyyy-MM-dd` day (round-trips `Date.UTC`) and **throws** otherwise, instead
     of silently opening the range (legacy/garbage) or rolling an impossible day
     over (`2026-02-30` → `2026-03-02`). It refuses its own output, closing
     double-expansion.
   - New `DayRangeInstantBounds` type; new `isInstantWithinBounds(timestamp,
     bounds)`; `isInstantWithinDayRange` delegates.
2. **Audit page** resolves bounds once per filter change and reuses them per row
   (`audit-log-page.tsx`).
3. **Tests**:
   - `date-range.test.ts` +5 (input contract) and a new
     `isInstantWithinBounds` block.
   - `audit-log-page.test.tsx`, `report-builder.test.tsx` anchor the target day
     to the system month the empty picker renders.
   - `date-picker-screens.test.tsx`, `inventory-invoice-create-page.test.tsx`
     pick a non-default day and assert it; a fixture guard asserts it.
   - `report-builder.test.tsx` explicit 15s timeout.
   - stale expense-form comment removed.
4. **Design doc** round-1 risk note points at the round-2 inclusive end bound.

## What changed in `0a70d5d7` (parent #440 decision)

The two inventory tests no longer pin the page's UTC-day conversion. They now
assert the submitted instant's **Algeria calendar day** equals the picked day
(`getAlgeriaDateInputValue(new Date(submitted))`). UTC midnight and Algeria
start-of-day both land on the same Algeria day, so the tests keep guarding the
DatePicker contract while leaving #440 free to change the conversion.

Red proof: with `DatePicker` mutated back to emitting `dd/MM/yyyy`, both tests
**failed** (2 failed / 23 skipped); restored, 25/25 pass.

## Not verified / reported

- Pre-existing invoice-page UTC-vs-Algeria seed/conversion
  (`inventory-invoice-create-page.tsx`): **filed by the parent as #440**, not
  fixed here. The PR's tests are now convention-agnostic so they do not pin it.
- `audit-log-page.tsx` still fetches the whole system log and filters
  client-side (pre-existing architecture).
- Hosted CI / hosted review: not available to this lane; the parent owns the PR.
  No push, no merge from this lane.
