# #473 — pin every stored business day to Africa/Algiers, forbid a bare date formatter

- mode: remote
- ticket: GitHub issue #473 (`AmaraNecib/tuari_react_hono`)
- target ref: `origin/develop`
- resolved base SHA: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- worktree/branch: `D:/projects/tuari_react_hono/worktrees/fix-algeria-day-pins` / `fix/473-algeria-day-pins`
- review tier: **Standard** (web UI readers + a CI hygiene rule; behavioural)
- follow-up from #440 / PR #472 (invoice day). This issue owns the rest of the sweep.

## Problem

A stored business day (`entryDate`, `transferDate`, `paymentDate`,
`lastPaymentDate`, `invoiceDate`, `expenseDate`, `purchaseDate`) is rendered by
readers that do not pin a timezone:

- bare `toLocaleDateString("ar-DZ", …)` / `toLocaleDateString("ar-DZ")`
- `new Intl.DateTimeFormat("ar-DZ").format(new Date(x))`
- optioned formatters without `timeZone`
- `settings-section.tsx`'s `toLocaleString()`

Every one renders in the *machine's* timezone. This dev machine is
`Africa/Algiers`, so all of them look correct here and none of the existing
tests can see the bug; a UTC or negative-offset machine shows the previous day
for any instant that crosses Algeria midnight.

## Design

### One pinned helper for a stored business day

`apps/web/src/lib/algeria-time.ts` already exports `formatAlgeriaDate`, the
single pinned date-only formatter (`dateStyle: "medium"`,
`timeZone: "Africa/Algiers"`). Extend it to accept the stored value directly
(`string | Date`) so a call site is `formatAlgeriaDate(entry.entryDate)` with no
per-site `new Date(…)` wrapper and no chance to forget the timezone. This is the
ONE helper; the deletion test passes (removing it re-scatters 14 call sites).

`settings-section.tsx` renders an *instant* (update-check `checkedAt`), not a
business day, so it uses the existing pinned `formatDateTimeInAlgeria`, which
also carries `timeZone`.

### Optioned formatters keep their options and take the pinned zone

Four readers need a specific `year/month/day` style, so they keep their local
`formatDate`/`formatDateLabel` and add `timeZone: getAlgeriaTimeZone()` inside
the options object (the issue's explicit instruction): `transfer-history-page`,
`location-transfer-history`, `license-settings`, `home-view-derived-formatters`.

### Hygiene rule

`tests/web-hygiene.test.mjs` gains a pure scanner
(`findUnpinnedDateFormatters(source)`) and two tests:

1. Production web source (`apps/web/src/**/*.{ts,tsx}`, excluding tests) contains
   no `toLocaleDateString(` / `Intl.DateTimeFormat(` call without a usable
   `timeZone` in its own second options argument.
2. The scanner is self-tested: a pinned sample yields none, an unpinned sample
   yields one, and a comment/string mention yields none — so the rule cannot
   pass vacuously.

The scanner uses the repository's installed TypeScript parser. It visits actual
call and constructor nodes, including JSX expressions and nested template
interpolations, without reading comments, regex contents or literal text as code.
Only a usable `timeZone` property in the call's second options argument counts.
A spread after that property makes the result unknown and is conservatively
reported. Shorthand `{ timeZone }` is also reported: the syntax alone does not
show a usable value, so callers must provide an explicit value instead. No
package or lockfile change is needed.

The template-interpolation regression fails against the earlier character
scanner. Its red evidence is in
`.scratch/reviews/473/guard-20261102/template-scanner-red.log`.

### TZ-pinned tests

A new `apps/web/src/features/stored-business-day-timezone.test.tsx` renders each
touched reader under `process.env.TZ = "UTC"` (restored in `afterEach`), feeds an
instant that is the *next* Algeria day (`…T23:00:00.000Z`), and asserts the
Algeria day renders (and that the UTC slice does not). Existing screen suites
(`salaries-section`, `employee-details-page`, `license-settings`,
`debts-mvp-web`) get an in-place pinned assertion where the harness already
exists.

### Scope note (not in this lane)

Issue item 4 — the expenses bar "current month" quick filter and the
filter-following KPI label — is not in this lane's brief (Tasks 1–3 only). Left
for the separate expenses filter/KPI work in #483. PR #485 remains part of
#473 and must not claim to close the whole issue.

## Public API / contracts

- `formatAlgeriaDate(value: string | Date, locale = "ar-DZ"): string` — widened
  parameter; same return, same pinned zone.
- `findUnpinnedDateFormatters(source): Array<{ line: number; callee: string; call: string }>`
  — new test helper (not shipped).

## Risks

- Switching bare numeric call sites to `formatAlgeriaDate`'s `medium` style is a
  small visual change (numeric → day-month-name) on the inventory invoice list
  and details pages, outbound transfers, and the debt/salary tables. It matches
  the app's existing date style (expenses, projects) and no test asserts the old
  numeric string; the TZ-pinned screen tests assert the `medium` output, so a
  future style change fails them.
- `process.env.TZ` is process-wide; the test restores it in `afterEach` so no
  other suite in the worker inherits UTC.

## Tests

- `tests/web-hygiene.test.mjs` — new rule + self-tests (node:test).
- `apps/web/src/features/stored-business-day-timezone.test.tsx` — per-screen
  TZ=UTC assertions.
- In-place pinned assertions in the four existing screen suites.

## Verification

`pnpm check:web-hygiene`; `pnpm --filter @tuari/web test`; `pnpm typecheck`;
`pnpm lint`.

The parser round passed contracts build, typecheck, lint with zero errors and
all 13 scanner tests. Full web subsequently passed 1,001/1,001 tests across
105 files. A two-worker full API run hit two 10-second file-based SQLite setup
hook deadlines; both affected files passed 35/35 when focused. The controlled
full API run with the existing VITEST_MAX_WORKERS=1 setting passed 1,687 tests
with 3 skipped across 94 files. No assertion, hook deadline or test selection
changed. This result is consistent with I/O contention, not proof of its cause.
Logs are retained under .scratch/reviews/473/guard-parser-20261102/,
guard-final-rerun-20261102/ and guard-api-one-worker-20261102/; the scanner's
initial failing template regression is preserved separately. Hosted CI and
final-source independent reviews remain required after publication.

The final critic found an unresolved shorthand option that the self-test had
accepted. A new regression defines the shorthand binding as undefined and
checks both formatter types, including shorthand after a spread. It failed on
the previous scanner and passes after conservative shorthand rejection. All
14 scanner tests pass; no production web/API source changed. Red/green logs
are in .scratch/reviews/473/shorthand-20261102/.

The three test-audit lenses then found two minor gaps: computed string-literal
member access was not recognized, and null rejection lacked a direct assertion.
The scanner now treats literal element access like named property access for
both formatters, including no-substitution template keys. Four unpinned forms
and four pinned controls cover these paths; the new regression failed before
the fix. The effective-options test now explicitly rejects null. All 15 scanner
tests pass. Logs are in .scratch/reviews/473/computed-access-20261102/. This does
not add alias or whole-program data-flow analysis. Production files and
packages remain unchanged from the full API/web guard.

## Develop integration handoff

Integration worktree: `D:/worktrees/tuari_react_hono/t3-9702c80a`, branch
`fix/integrate-algeria-day-pins`. Verification mode: `focused-local /
CI-final-enforced`; the parent supplied current ruleset `26837184`, strict CI
acceptance `15368`, resolved threads, and no bypass as the current protection
record. Latest fetched develop before integration was
`4917fd2cc733be63e21cf3e61d57a9ed7627b7e9`.

The preserved PR head `cd1d616f2df6ba153b59bb4bcefd456091a3e58c` was confirmed
as an ancestor after merging its source branch. Commit
`97650564291260b2ae9fe3dc1e8d27e009d84e75` was merged as a normal merge so the
required debt-test import-order correction remains in history. Develop was then
merged normally. Conflicts were resolved by retaining develop's CI staging and
workflow-policy checks, retaining the new runtime-staging helper in the sidecar
builder/test, and keeping develop's encrypted database byte-preservation check.
The #483 expenses filter and #484 stored-instant scanner sweep were not added.
The incoming branch had mistakenly tracked prior `.scratch/reviews/473/`
operational evidence. The integration removes those paths from Git's index and
keeps local copies ignored, as required by the repository workflow.

Focused pre-commit checks after the contracts build passed: eight web test
files (40 tests), `pnpm check:web-hygiene` (16 tests), web lint, web typecheck,
`tests/workflow-policy.test.mjs` (6/6 tests), and
`apps/desktop/scripts/runtime-staging.test.mjs` (34/34 tests). The initial web test and typecheck attempts failed because the
contracts package had not been built; the first workflow-policy attempt
correctly exposed tracked review evidence. All three conditions were addressed
before these successful runs. The SQLCipher sidecar integration test was not
run: pnpm reported its native build script blocked, and no prebuild was
verified against the pinned version/hash. Evidence: `.scratch/reviews/473/develop-integration-r2-20261103/`.

Applied wisdom: the canonical Algeria date helper remains shared rather than
recreated per screen. Date-only business-day values remain distinct from numeric
locale output and stored instants. Range bounds stay in the shared date-range
helper, with single-day values kept as points. No module interface or seam
changed; architecture: no seam moved.
