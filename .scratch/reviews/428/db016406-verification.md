# #428 / PR #438 — verification evidence (`db016406`)

- base: `develop` @ `edf1e5b3`
- branch/worktree: `fix/428-datepicker-audit` · `worktrees/fix-datepicker-audit`
- code commit reviewed: `db016406` (HEAD; previous PR head `bce57a45`)
- review tier: Standard, escalated to the brief's aggressive local review
  (debate + code-review + test-audit) because the hosted Greptile gate is
  unavailable and this lane is the merge gate.

## Commands and results (worktree root)

| Command | Result |
|---|---|
| `pnpm --filter @tuari/web exec vitest run --maxWorkers=2 <12 touched suites>` | PASS — 12 files, 112 tests |
| `pnpm --filter @tuari/web test --maxWorkers=2` (full, final) | PASS — 81 files, 680 tests |
| `pnpm typecheck` (root, turbo) | PASS — 4/4 tasks |
| `pnpm lint` (root, turbo) | PASS — 2/2 tasks |
| `pnpm check:unslop` | PASS — 0 error / 1659 warn (unchanged from base; no new warnings) |
| scoped v8 coverage `src/lib/date-range.ts` | 100% stmts (24/24), 100% branch (19/19), 100% funcs (5/5), 100% lines (19/19) |
| scoped v8 coverage `src/features/audit/audit-log-page.tsx` | 56.6% stmts / 60.7% branch (pre-existing file; only the new range block is covered) |

No E2E spec exists for this PR (no `tests/e2e/` file in the diff), so none was
run. The full suite was run twice only because the first run exposed the
report-builder 5s timeout under load; the second is the final green run.

## What changed in `db016406`

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

## Not verified / reported

- Pre-existing invoice-page UTC-vs-Algeria seed/conversion
  (`inventory-invoice-create-page.tsx`): a ~1h-per-day window where the default
  invoice date is the previous Algeria day. Out of this PR's subject; the PR's
  new tests pin the existing UTC conversion. **Reported to the parent for a
  follow-up decision, not fixed.**
- `audit-log-page.tsx` still fetches the whole system log and filters
  client-side (pre-existing architecture).
- Hosted CI / hosted review: not available to this lane; the parent owns the PR.
