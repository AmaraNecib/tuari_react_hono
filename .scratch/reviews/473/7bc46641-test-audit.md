# Test audit — issue #473 (head `7bc46641`)

Three fresh-context auditors over the full PR diff
`d6164c651a42be41f5b4824a53fa88e06e8a1ffa...17bfe28f94365b2c13b0aa7ea65c088224e009d8`
plus the fixes that gate produced, committed at
`7bc4664177f7306b76d7a0cdff3eb69e63800f57`.

- Edge Case Hunter: `90815f55-7b10-4de8-994c-c9baf655732f`
- Coverage Analyst: `8e5cf94a-584b-4b73-8f5c-f0f844d9bea2`
- Quality Reviewer: `8d02e0b3-bad6-4afa-b8fc-88ecd4cf70e7`

## Acceptance item → test map (all green at `7bc46641`)

| Item | Test | Status |
|------|------|--------|
| `formatAlgeriaDate` widened to `string \| Date` | `algeria-time.test.ts` | ✅ |
| `isAlgeriaCalendarDay` rejects rollover/`15junk`/ISO instants | `algeria-time.test.ts` | ✅ |
| `toAlgeriaDayBoundaryIso` start/end + rejections | `algeria-time.test.ts` | ✅ |
| `formatDateTimeInAlgeria` pinned | `algeria-time.test.ts`, `settings-section.test.tsx` | ✅ |
| Hygiene rule (production scan) | `tests/web-hygiene.test.mjs` | ✅ |
| Hygiene scanner self-test | `tests/web-hygiene.test.mjs` | ✅ |
| Optioned readers (transfer history, location history, license, home view) | `stored-business-day-timezone.test.tsx`, `license-settings.test.tsx` | ✅ |
| Debts readers (4), salary tables (2), employee details | in-place suites | ✅ |
| `InventoryInvoiceDetailsPage` | added at `7bc46641` (was UNTESTED) | ✅ |

## Findings and disposition

| # | Risk | Finding | Disposition |
|---|------|---------|-------------|
| E1 | red | Scanner blind to `toLocaleString`/`toLocaleTimeString` — the exact API `settings-section.tsx` was fixed for. | **Deferred to the parent** (issue Task 2 scopes two APIs; 8 instant sites + an open policy). In-PR overclaim fixed by renaming the test at `7bc46641`. |
| E2 | red | `{ timeZone: undefined }` / `{ timeZone: "" }` passed as pinned. | **Fixed** at `7bc46641`, with a failing-first self-test. |
| E3 | red | `formatAlgeriaDate` throws on an unparsable value where the replaced call returned `"Invalid Date"`. | **Fixed** at `7bc46641`: returns `—`; failing-first test. |
| E4 | orange | Regex literal containing a quote blanks the rest of a file. | **Deferred**, latent (verified no such literal in production source). |
| E5 | orange | `${…}` interpolation never scanned. | **Deferred**, documented. |
| E6 | orange | Aliasing / computed member / comment-before-paren bypasses. | **Deferred**; docstring states the heuristic's limits. |
| E7 | orange | False positive when options come from a shared const. | **Deferred** (design chose inline `timeZone`). |
| E8 | orange | Hardcoded `+1` offset vs the IANA zone could diverge under a DST rule. | **Dismissed.** `Africa/Algiers` is UTC+1 year-round by definition; the module doc states it. |
| E9 | orange | `listProductionWebSources` skipped `.mts`/`.cts` and did not exclude `__test-utils__`. | **Fixed** at `7bc46641`. |
| E10 | orange | `process.env.TZ` pinning relies on Node re-reading `TZ`, restored in `afterEach`. | **Dismissed** with a guard: every TZ suite asserts `resolvedOptions().timeZone === "UTC"` before its behavioural assertions, so a failed pin fails loudly. |
| E11 | yellow | Years `0`–`99` rejected by the `Date.UTC` two-digit remap. | **Dismissed** (no caller produces them; design pass recorded it). |
| E12 | yellow | Non-canonical `boundary` silently returns the end bound; inverted ranges untested; non-ISO bounds open. | **Deferred**; pre-existing `date-range.ts` behaviour, untouched by this diff. |
| C1 | — | Coverage: one named reader had no TZ assertion. | **Fixed** at `7bc46641`. |
| Q1 | — | All TZ tests use one instant and `TZ=UTC`; no negative-offset zone. | **Deferred.** UTC is the direction that breaks the *previous* day; a second zone would broaden, not strengthen, the same seam. |
| Q2 | — | Fixture-difference guard missing in `settings-section.test.tsx`; history not restored; weaker `queryByText` positive assert in `license-settings.test.tsx`; missing trailing newline in `employee-details-page.test.tsx`. | **Deferred** (cosmetic/low). |

## Grades (quality reviewer)

`algeria-time.test.ts` A · `web-hygiene.test.mjs` A · `stored-business-day-timezone.test.tsx`
A− · `salaries-section.test.tsx` A− · `license-settings.test.tsx` B+ ·
`debts-mvp-web.test.tsx` B+ · `settings-section.test.tsx` B ·
`employee-details-page.test.tsx` B. No missing-await or cross-suite isolation
defect found.

## Re-verification at `7bc46641`

- Focused web suites (8 files, 109 tests) → pass.
- `pnpm check:web-hygiene` → 11/11.
- `pnpm typecheck`, `pnpm lint` → pass, 0 errors.
- 11 scanner probes → all intended (see `7bc46641-debate.md`).
