# Code review — issue #473 (head `fe9a4fbb`)

Two axes, against the pinned local base. `git diff
d6164c65...fe9a4fbb`, `git log d6164c65..fe9a4fbb --oneline`.

- mode: remote
- base SHA: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- reviewed HEAD: `fe9a4fbb61cbce0449427744c29a9c1e4231490b`
- tier: Standard

## Spec (issue #473)

| Task | State |
| --- | --- |
| 1. One pinned helper + `timeZone: getAlgeriaTimeZone()` where options are taken | shipped (`algeria-time.ts`, 14 call sites) |
| 2. Hygiene rule with self-test (pinned/unpinned/comment) | shipped, repaired this round |
| 3. TZ-pinned screen tests | shipped (`stored-business-day-timezone.test.tsx`, per-screen assertions) |
| 4. Expenses "current month" filter + KPI label | out of this lane's brief; parent owns scoping (recorded in the design) |

The round-4 delta closes the two rule defects the hosted review raised:

- quoted `timeZone: "Africa/Algiers"` no longer fails `lint`/`test`;
- a commented-out `timeZone` no longer passes the scan.

No spec drift.

## Standards

- Commit staging: explicit single-file `git add tests/web-hygiene.test.mjs`; no
  `git add -A`.
- Commit message names the issue (`#473`) and states cause and fix.
- Tests added for every behavioural change; self-test proven red pre-fix.
- Contract of `hasUsableTimeZoneOption` documents the accepted value forms and
  the heuristic's limits; the stale "spread also counts" claim was corrected.
- Typecheck, lint and `pnpm check:web-hygiene` green on the reviewed HEAD.

## Findings from the hosted review (round 4)

1. Quoted `timeZone` rejected — **fixed** (code).
2. Commented option accepted — **fixed** (code).
3. `settings-section.test.tsx` `t` mock not reading `ar.translation` —
   **dismissed / outdated**: the current mock already walks `ar.translation`
   and falls back to key or fallback arg
   (`apps/web/src/features/app-shell/settings-section.test.tsx:21`–`:44`).
   `settings-section.test.tsx` passes under `vitest run`.
4. `algeria-time.ts` comment overstating calendar validation — **dismissed /
   outdated**: `isAlgeriaCalendarDay` does the real `Date.UTC` round-trip
   (`apps/web/src/lib/algeria-time.ts:22`–`:39`) and `toAlgeriaDayBoundaryIso`
   calls it (`:46`); the comment at `:41`–`:44` matches the real limit.
   `algeria-time.test.ts:87`–`:96` assert `2026-02-30`, `2026-13-01`,
   `2026-04-31` and `2026-11-00` are rejected.

## Verdict

No unresolved or actionable findings on the reviewed HEAD.
