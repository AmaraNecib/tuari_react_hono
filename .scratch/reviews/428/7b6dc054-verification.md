# #428 round 2 verification evidence — `7b6dc054`

- base: `develop` @ `9949146208d276915b31f28ba9a95788a6e113f5`
- branch/worktree: `fix/428-datepicker-audit` · `worktrees/fix-datepicker-audit`
- review tier: Standard
- mode: remote (local checks only; parent owns push/PR; no Greptile requested)

Code commit reviewed: `7b6dc054ba7dbbe94146c5a214375d00bc39c755` (includes the
`.agents/wisdom/testing.md` range-boundary lesson). Evidence is committed in a
follow-up docs commit, so `git diff 7b6dc054 HEAD` is `.scratch/`-only.

## Commands and results (from the worktree root, on `7b6dc054`)

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/web test --maxWorkers=2` | PASS — 81 files, 672 tests (was 659 at `000d12b`; +13) |
| `pnpm typecheck` (root, turbo) | PASS — 4/4 tasks (run on the byte-identical source before the wisdom fold; re-verified web below) |
| `pnpm --filter @tuari/web typecheck` (on `7b6dc054`) | PASS |
| `pnpm lint` (root) | PASS — 2/2 turbo tasks; all `check:` scripts green |
| `pnpm --filter @tuari/web lint` (on `7b6dc054`) | PASS |
| `pnpm check:unslop` (on `7b6dc054`) | PASS — 0 error / 1659 warn (was 1656; +3 advisory warns from the new wisdom entry) |
| scoped v8 coverage `src/lib/date-range.ts` | 100% stmts (10/10), branches (14/14), funcs (2/2), lines (7/7) |
| scoped v8 coverage `src/features/expenses/expenses-filters.ts` | 100% stmts (12/12), branches (8/8), funcs (2/2), lines (8/8) |
| scoped v8 coverage `src/features/app-shell/workspace-queries.ts` | lines 52.83% (up from 41.5%; `useSystemLogQuery` now covered, rest of the file is other hooks) |
| scoped v8 coverage `src/features/shared/table-primitives.tsx` | 92% stmts / 100% branches / 91.66% lines |
| scoped v8 coverage `src/features/audit/audit-log-page.tsx` | 55.76% stmts / 58.13% lines (file had no test before; only the new range test touches it) |
| scoped v8 coverage `src/hooks/use-report-queries.ts` | 9.61% stmts (the rest is `formatReportAsCSV`, unchanged and untested before) |

The wisdom file is Markdown under `.agents/`; the suite was re-run on the folded
commit (672/672) and `check:unslop` covers it. No source byte changed between the
pre-fold and folded commits.

## What changed (round 2)

1. **Range boundary rule.** New `apps/web/src/lib/date-range.ts`:
   - `resolveDayRangeBounds({fromDate, toDate})` → inclusive Africa/Algiers
     bounds (`start` = `…T23:00:00.000Z` previous UTC day, `end` =
     `…T22:59:59.999Z`), blank side = open.
   - `isInstantWithinDayRange(timestamp, range)` for client-side filters.
   Applied to every range consumer:
   - `audit-log-page.tsx` — replaced `new Date(endDate)` (UTC midnight, dropped
     the picked day) with `isInstantWithinDayRange`.
   - `features/app-shell/workspace-queries.ts` (`useSystemLogQuery`) — same rule
     via the shared helper (was already end-of-day, now one implementation).
   - `hooks/use-report-queries.ts` — bare day was rejected by the wire
     `datetime({offset:true})` contract; now expands to inclusive instants.
   - `features/expenses/expenses-filters.ts` — same rule via the shared helper.
   - `shared/table-primitives.tsx` (`DateRangeFilter`) — doc now states consumers
     must expand to bounds.
2. **Test finding.** `debts-mvp-web.test.tsx` now picks a day that is not the
   form default and asserts the submitted `paymentDate`, so it proves the pick
   changed the value; the old version picked today (the default) and could pass
   on a no-op.
3. **Wisdom.** `.agents/wisdom/testing.md` records the durable rule and the
   consumer audit, per the parent's decision.

## Tests added

- `lib/date-range.test.ts` — 23:59 on the end day is in; 00:00 next day is out;
  00:00 on the start day is in; open bounds; unparsable instant.
- `features/audit/audit-log-page.test.tsx` — renders a log at 23:59 on the picked
  end day and a log after midnight, picks the end day through the real
  `DateRangeFilter`, asserts the 23:59 log survives and the next-day log is
  filtered out.
- `features/reports/report-builder.test.tsx` — asserts the wire call carries the
  inclusive start/end-of-day instants.
- `features/app-shell/workspace-queries.test.ts` — pins the system-log wire
  bounds and the no-filter path.

## Other range consumers audited (no change needed)

- API `report.helpers.resolveReportWindow`: `entryMs >= startMs && entryMs <= endMs`
  — inclusive; the client now supplies end-of-day.
- API `company.system-log.compareTimestampsDesc`: inclusive upper bound; same.
- Single-day consumers (`occurredAt`, `entryDate`, `paymentDate`, `expenseDate`,
  `openingEntryDate`) intentionally use the day's **start** (a point event), not
  a range — unchanged and already pinned by the #428 screen tests.
