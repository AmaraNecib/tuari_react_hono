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
   no `toLocaleDateString(` / `new Intl.DateTimeFormat(` call whose balanced
   parentheses do not contain `timeZone`.
2. The scanner is self-tested: a pinned sample yields none, an unpinned sample
   yields one, and a comment/string mention yields none — so the rule cannot
   pass vacuously.

The scanner walks the source char-by-char, ignoring comments and string
literals, matches the two APIs only in code, and balances the call's parens
(also skipping nested strings/comments) before looking for `timeZone`.

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
for the parent to scope/queue.

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
