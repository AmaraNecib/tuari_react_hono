# #428 round 2 code review — `7b6dc054`

Lane self-review against the pinned base. A sub-agent review was not run; the
brief scopes review ownership to the parent and excludes a Greptile request.

## Standards axis

- Touched only `apps/web` source/tests, `.agents/wisdom/testing.md`,
  `.scratch/implementation/` and `.scratch/reviews/`. No config, lockfile,
  generated artifact, or unrelated file.
- One new module (`lib/date-range.ts`) with one responsibility and unit tests at
  100% lines/branches; the four range consumers call it instead of each
  re-deriving a boundary.
- Behavior-preserving refactors in `workspace-queries` and `expenses-filters`
  use the same `toAlgeriaDayBoundaryIso(…, "start"/"end")` calls the shared
  helper wraps.
- The wisdom entry states the rule and the audit that produced it; it is the
  durable, agent-facing record, not a duplicate of the design doc.
- No `git add -A`; explicit staging. No tracked generated artifact was modified
  (contracts `dist/` is ignored).

Potential concerns considered and dismissed:

- `useReportQuery`'s React Query key still uses the raw picked days while the
  query function sends expanded instants. That is deliberate: the key must be
  stable across renders, and the day pair is the user-facing identity of the
  filter; the wire input is derived from it.
- `audit-log-page.test.tsx` and `report-builder.test.tsx` mock
  `@/lib/orpc-client`; this is the narrow seam the page consumes, and the real
  `resolveDayRangeBounds`/`isInstantWithinDayRange` still run.

## Spec axis (the round-2 brief)

| requirement | status |
| --- | --- |
| Decide the boundary for every range consumer | Done — end day inclusive to its 23:59:59.999 Algeria instant, start day from 00:00; one shared helper |
| Apply consistently to audit log / system log / report builder / `DateRangeFilter` | Done — audit log and report builder fixed; system log and `DateRangeFilter` doc/implementation aligned |
| Test a log at 23:59 on the picked end date is included | Done — `date-range.test.ts` (unit) and `audit-log-page.test.tsx` (screen) |
| `debts-mvp-web.test.tsx` must pick a non-default day and assert the submitted value | Done |
| Audit the other range consumers | Done — API `resolveReportWindow` and `listSystemLog` inclusive upper bounds; single-day consumers intentionally use start-of-day |
| Capture the durable lesson | Done — `.agents/wisdom/testing.md`, folded into this code commit |

## Findings

None blocking. Evidence is re-pinned to this SHA; the earlier `a2102598-*` and
`1ae12051-*` evidence is removed because reviewable files changed since they
were written (the guard would mark them stale).
