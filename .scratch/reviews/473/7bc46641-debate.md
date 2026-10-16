# Debate — issue #473 (head `7bc46641`)

Adversarial review (critic + defender) of the full PR diff
`d6164c651a42be41f5b4824a53fa88e06e8a1ffa...17bfe28f94365b2c13b0aa7ea65c088224e009d8`
(the round-2 gate HEAD), plus the fixes that gate produced, committed at
`7bc4664177f7306b76d7a0cdff3eb69e63800f57`. Both children ran in fresh context
against the worktree, read-only.

- Critic: `f6d0a73a-6644-4bb0-8911-7d14a73f894d`
- Defender: `47a376d1-6252-4fb0-aa7a-1935fd8f6774`

## Critic findings and disposition

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| C1 | 7 | Scanner ban list omits `toLocaleString`/`toLocaleTimeString`; the issue's own `settings-section.tsx` bug was a bare `toLocaleString`. `toLocaleTimeString` has no numeric use; `toLocaleString` on a `Number` (`dashboard-overview.tsx:41`) is legitimate, so a bare ban would false-positive. | **Deferred to the parent** with the fix attached. The issue's Task 2 scopes the rule to `toLocaleDateString(` / `new Intl.DateTimeFormat(`; extending it to instants also pulls in 8 live unpinned sites (`audit-log-page.tsx:105,215`, `inventory-invoice-details-page.tsx:183`, `asset-charge-history.tsx:156`, `report-builder.tsx:107`, `use-report-queries.ts:79,94,110`) and an open policy question (do audit/report timestamps keep seconds? business zone or machine zone?). That is a follow-up, not this fix-PR. The in-PR part of the finding — the test name overclaimed "every date formatter" — **is fixed** at `7bc46641`: the test now names the two APIs it enforces. |
| C2 | 6 | `timeZone` false negative: `/\btimeZone\b/` on the raw call slice accepts `{ timeZone: undefined }`, `{ timeZone: "" }` and a comment that merely mentions the word. | **Fixed** at `7bc46641`. `PINNED_TIME_ZONE_PATTERN` requires the key plus a non-space, non-`undefined`/`null`/quote value (or the `{ timeZone }` shorthand). Failing-first self-test added; the naive `\s*` backtracking that first let `undefined` pass was caught by that test and fixed with a `(?=\S)` anchor. |
| C3 | 6 | `formatAlgeriaDate` throws `RangeError: Invalid time value` on an unparsable stored day, where the replaced `new Date(x).toLocaleDateString("ar-DZ")` rendered `"Invalid Date"`. Three converted sites (`inventory-invoices-page.tsx:134`, `outbound-transfers-page.tsx:114`, `inventory-invoice-details-page.tsx:77`) would now unmount the surface on one corrupt row. | **Fixed** at `7bc46641`. The helper returns `—` for `Number.isNaN(date.getTime())`, matching `backup-settings.tsx:25-27`. Failing-first test added. |
| C4 | 5 | Template-literal `${…}` interpolation is opaque to the scanner. | **Deferred**, documented heuristic. No live `${}` formatter call. |
| C5 | 4 | ~110 lines of hand-rolled lexer is weaker than an ESLint `no-restricted-syntax` rule. | **Deferred to the parent** as the AST-rule follow-up; it is a re-implementation choice, not a bug. |
| C6 | 4 | Four near-identical optioned formatters remain (Duplicated Code). | **Dismissed.** The issue's Task 1 instructs "where a formatter takes options, pass `timeZone: getAlgeriaTimeZone()`", and the design pass at `c330d857` chose per-site style preservation (numeric→medium is a declared risk). Removing the local helpers would change each site's rendered style. Recorded, not fixed. |
| C7 | 4 | date-fns `format` (a dependency) is not banned. | **Deferred** with C1's instant policy. `date-picker.tsx` is the only importer and its round trip is day-stable. |
| C8 | 3 | Regex literals are not lexed; a quote inside one desyncs the scan. | **Deferred**, latent. Verified at `7bc46641` that no production source contains a regex literal with a quote; the failure is silent, so it is in the AST-rule follow-up. |
| C9 | 3 | A call pinned via a variable of options is a false positive. | **Deferred**; documented in the rule docstring. |
| C10 | 3 | No written policy on instants. | **Deferred to the parent** (same follow-up as C1). |
| C11 | 2 | `__test-utils__` not excluded from the production scan. | **Fixed** at `7bc46641` (also broadened to `.mts`/`.cts`). |
| C12 | 2 | `isAlgeriaCalendarDay` runs twice per `date-range` bound; `algeria-time.ts` re-parses groups it just matched. | **Deferred.** Pre-existing shape from round 3, not touched by the gate fixes; a `parseAlgeriaDay` returning the triple is a clean follow-up. |
| C13 | 2 | Unbalanced-input branch slices the whole file into the violation. | **Dismissed** (diagnostic-only, bounded by the file). |
| C14 | 2 | Fixture doc said "one hour before Algeria midnight" for an instant that *is* Algeria midnight. | **Fixed** at `7bc46641`. |
| C15 | 2 | `formatDateTimeInAlgeria` was not widened to `string \| Date`. | **Dismissed.** Its caller (`settings-section.tsx:139`) already guards and wraps; no live `string` caller. |

## Defender's sustained points

The defender rated D1–D8 (single helper, optioned sites take
`getAlgeriaTimeZone()`, settings uses the instant formatter, the char-walking
scanner, the non-vacuous TZ tests, the anchored canonical parse, the
single-sourced `isAlgeriaCalendarDay`, the rule wired into `lint`/`test`) at
8–9/10 and could not break any of them. It withdrew only the design doc's
"14 call sites" (13 real) and any claim that the scanner is airtight (it is a
documented heuristic). Both are accuracy notes, not defects; the scanner's
docstring at `7bc46641` now says exactly what it does and does not cover.

## Re-verification at `7bc46641`

- `node --test ./tests/web-hygiene.test.mjs` → 11/11 pass (including the new
  valueless-pin and nested-call self-tests).
- 11 crafted scanner probes → all as intended: `undefined`/`""`/`null`/comment
  mention flagged; real pin and `{ timeZone }` shorthand pass; `new Intl...`
  reported once; nested inner call reported. Two latent holes confirmed and
  left documented: a regex literal containing a quote, and `${…}` interpolation.
