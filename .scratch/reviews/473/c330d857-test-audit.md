# Test Audit — issue #473 (Algeria day pins), head `c330d857`

- repo: `D:/projects/tuari_react_hono/worktrees/fix-algeria-day-pins`
- base SHA: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- fix commit: `46567538` — `fix(web): pin every stored business day to Africa/Algiers, and forbid a bare date formatter (#473)`
- intermediate: `a6d388ab` — settings guard + shared TZ fixture (previous audit head)
- head SHA: `c330d857` — `test(web): finish the TZ fixture dedup and harden the hygiene scanner (#473)`
- audited delta: `a6d388ab..c330d857` (3 files: `tests/web-hygiene.test.mjs`, `apps/web/src/features/stored-business-day-timezone.test.tsx`, `.scratch/implementation/473-design.md`)
- method: read-only static audit (`git diff`, `git log`, source + test reads, `grep` cross-checks). **No suite was run** (CPU-bound instruction). Revert-sensitivity was established by reading the fixture instants, the mock data, and the assertions — an assertion is revert-sensitive when a correctly-implemented reader renders a *different* string than a reverted (unpinned / wrong-zone) reader.

## 1. Delta under audit

| file | change |
|---|---|
| `tests/web-hygiene.test.mjs` | `findMatchingParen` now returns `-1` on unbalanced input (`:98`) instead of `source.length - 1`; `findUnpinnedDateFormatters` flags an unbalanced call and stops (`:138-143`); `listProductionWebSources` excludes `test-utils/`, `__tests__/`, `__mocks__/` (`:165-170`); new self-test line for the unbalanced case (`:292-293`) |
| `apps/web/src/features/stored-business-day-timezone.test.tsx` | local `const MIDNIGHT_CROSSING` removed; `MIDNIGHT_CROSSING` added to the shared-util import (`:18`) — the last dedup leftover |
| `.scratch/implementation/473-design.md` | API note updated to `{ line, callee, call }`; Risks section names the affected screens and pins the `medium`-style expectation |

The delta is test/tooling-only. No production source changed between `a6d388ab` and `c330d857`, so the per-screen coverage map from the `a6d388ab` audit still holds at head; this audit re-verifies it and grades the scanner/dedup deltas.

## 2. Agent 1 — Edge Case Hunter

Boundary under test: an instant one hour before Algeria midnight (`2026-09-30T23:00:00.000Z`), forced to run under a non-Algerian zone.

- **Correct** — `MIDNIGHT_CROSSING = "2026-09-30T23:00:00.000Z"` (`apps/web/src/test-utils/algeria-day.ts:8`) is still the true boundary: `2026-10-01T00:00` in `Africa/Algiers` (UTC+1, no DST). Under `TZ=UTC` an unpinned formatter renders `2026-09-30`, so every screen assertion is revert-sensitive.
- **Correct** — the new unbalanced-input self-test is non-vacuous in the *detection* direction: `findUnpinnedDateFormatters('const a = new Intl.DateTimeFormat("ar-DZ"')` returns exactly 1 item (`tests/web-hygiene.test.mjs:292-293`). The `-1` sentinel and the `break` are both exercised; before this delta `findMatchingParen` returned `source.length - 1`, which produced a garbage slice and could let a later `timeZone` in the tail mask a genuinely unbalanced call.
- **Correct** — `findMatchingParen` still skips nested strings and comments while balancing (`:76-96`), and the pre-existing `nested` self-test (`new Intl.DateTimeFormat("ar-DZ", { timeZone: fn("a)b", (x) => x) }).format(d)` → `[]`) confirms nested parens/strings do not now trip the `-1` path.
- 🟡 **Edge case, minor** — the scanner does not skip regex literals or template-literal `${…}` interpolation (documented as a text-level heuristic at `:103-109`). A stray `(` inside a regex literal that precedes a formatter call in the same file could make `findMatchingParen` return `-1` and emit a **false positive**. Direction of the risk is safe (it over-reports and fails loudly, never silently passes), and no such construct exists in `apps/web/src` today. Note only.
- 🟡 **Edge case, minor** — `settings-section.test.tsx:117` asserts only `timeZone === "UTC"` and omits the `ALGERIA_DAY !== UTC_DAY` guard its siblings carry. Still non-vacuous: the test asserts the Algeria stamp is present **and** the UTC stamp is absent, which cannot both hold if the two stamps coincided. No fix required.
- 🟡 **Edge case, minor** — no test feeds an invalid `checkedAt` to the settings stamp, so the `isNaN(date.getTime()) → "-"` branch (`settings-section.tsx:138-139`) stays uncovered. Pre-existing, unchanged by this delta.

## 3. Agent 2 — Coverage Analyst

Reconstructed the issue's named renderers from `46567538`; the `a6d388ab..c330d857` delta did not touch any production reader, so the mapping is unchanged at head.

| # | issue-named production reader | pinned TZ=UTC render test | revert-sensitive? |
|---|---|---|---|
| 1 | `settings-section.tsx:140` — update stamp | `settings-section.test.tsx` (test at `:120`) | yes — mock `checkedAt` is the midnight crossing; a reverted bare `toLocaleString()` under UTC renders the UTC stamp, so `getByText("آخر فحص: <algeria>")` fails |
| 2 | `salaried-workers-table.tsx:140` — `lastPaymentDate` | `salaries-section.test.tsx:681` | yes |
| 3 | `salary-payments-table.tsx:177` — `paymentDate` | `salaries-section.test.tsx:666` | yes |
| 4 | `debt-ledger-panel.tsx:192` — `entryDate` | `debts-mvp-web.test.tsx:684` | yes |
| 5 | `consolidation-dialog.tsx:187,234` — `entryDate` ×2 | `debts-mvp-web.test.tsx:702` | yes — `toHaveLength(2)` fails when exactly one of the two call sites is reverted |
| 6 | `void-entry-dialog.tsx:107` — `entryDate` | `debts-mvp-web.test.tsx:708` | yes |
| 7 | `record-entry-payment-dialog.tsx:104` — `entryDate` | `debts-mvp-web.test.tsx:721` | yes |
| 8 | `employee-details-page.tsx:518` — `paymentDate` | `employee-details-page.test.tsx:376` | yes |
| 9 | `license-settings.tsx:52` — expiry | `license-settings.test.tsx:303` | yes |
| 10 | `home-view-derived-formatters.ts:19` — `formatDateLabel` | `stored-business-day-timezone.test.tsx:116-119` | yes |
| 11 | `transfer-history-page.tsx:21` | `stored-business-day-timezone.test.tsx:121` | yes |
| 12 | `location-transfer-history.tsx:19` | `stored-business-day-timezone.test.tsx:127` | yes |
| 13 | `outbound-transfers-page.tsx:114` | `stored-business-day-timezone.test.tsx:133` | yes |
| 14 | `inventory-invoices-page.tsx:134` | `stored-business-day-timezone.test.tsx:139` | yes |
| 15 | `lib/algeria-time.ts` — `formatAlgeriaDate` | `algeria-time.test.ts:42-43` | yes (unit) |
| — | **`inventory-invoice-details-page.tsx:77`** (changed, **not** issue-named) | **none** | **no behavioural guard** |

- **Correct** — every issue-named renderer has a revert-sensitive pinned assertion, including `settings-section` (the previously unguarded stamp) and every debts dialog surfaced through `debts-mvp-web.test.tsx`. Acceptance-criterion coverage for the issue's named list is complete.
- **Correct** — the scanner can no longer pass vacuously, on two axes: (a) `assert.ok(files.length > 0, 'the production web scan must find source files')` (`tests/web-hygiene.test.mjs:225`) guards directory/filter drift; (b) the self-test asserts both directions — pinned/mention/nested inputs yield `[]`, unpinned inputs yield the two expected callees **and** the two expected line numbers, and unbalanced input yields `1` (`:270-293`). A scanner that returned `[]` always, or flagged everything, fails the self-test.
- **Correct — fixture dedup is complete.** `grep -rn "process.env.TZ" apps/web/src tests` matches **only** `apps/web/src/test-utils/algeria-day.ts`; `grep -rn "MIDNIGHT_CROSSING"` shows the constant declared **once** (`algeria-day.ts:8`) and imported by all six suites; `grep -rn "function dayIn|const dayIn"` matches only the shared util. The `a6d388ab` leftover (local `const MIDNIGHT_CROSSING` in `stored-business-day-timezone.test.tsx`) is gone — confirmed in the diff and by re-grep at head. No `originalTimeZone`/`originalTz` leftovers exist.
- 🟡 **Dedup, one literal by necessity** — `settings-section.test.tsx:17` still spells the instant inline (`checkedAt: "2026-09-30T23:00:00.000Z"`) rather than importing `MIDNIGHT_CROSSING`. This is required for correctness, not an oversight: `vi.mock(...)` factories are hoisted above module imports, so the factory cannot reference an imported top-level `const`. The value is correct and the test is revert-sensitive. The only dedup would be `vi.hoisted(...)`, which is not worth the indirection. Note only.
- **Correct** — no duplicate coverage introduced: the shared fixture replaced six inline copies rather than adding a seventh; the only "duplicate" is the hoisted-factory literal above.
- **Gap (out of the issue's named list)** — `apps/web/src/features/inventory/inventory-invoice-details-page.tsx:77` was converted to `formatAlgeriaDate(detail.group.invoiceDate)` (forced by the hygiene rule), but its suite supplies `invoiceDate: "2026-03-20T10:00:00.000Z"` (a mid-day instant that never crosses Algeria midnight) and asserts nothing about the rendered day. Reverting that line to an unpinned formatter is caught **only** by the static scanner, not behaviourally; a *wrong-zone* regression (`timeZone: "UTC"`) would slip through both. Follow-up, not a blocker.

## 4. Agent 3 — Quality Reviewer

- **Correct** — test names state behaviour and the counterfactual ("…renders the Algeria day, not the ambient UTC day"), so a failure reads as a bug report.
- **Correct** — no async gaps: handler/hook mocks are synchronous `vi.fn()` returns; `cleanup()` runs in `afterEach` in all six suites, so the process-wide `TZ` mutation is always restored.
- **Correct** — isolation: `pinUtcTimeZone()` (`algeria-day.ts:28-38`) is a per-test save/restore pair (including the `delete process.env.TZ` branch when `TZ` was unset), and the shared constants (`ALGERIA_DAY`, `UTC_DAY`, …) are computed with explicit `timeZone` at import time, so they are unaffected by the forced process zone.
- **Correct** — the new scanner self-test is placed inside the existing self-test `test(...)`, so it inherits the file's fixtures and does not add a parallel test surface.
- **Correct** — the `test-utils` exclusion (`:165-170`) is a de-risking change, not a coverage hole: it removes the fixture helper from the production scan, where a future option-assembling helper would have raised a false positive. `apps/web/src/test-utils/algeria-day.ts:17` uses an explicit `timeZone` key and would pass either way. Production coverage is unaffected because the filter only widens the exclusion set by test-only directories.
- 🟡 **Scanner boundary** — `listProductionWebSources` now excludes `test-utils`, `__tests__`, `__mocks__`; it still includes any other test-ish directory (none exist). Acceptable; the non-vacuity guard prevents a filter-drift regression.

## 5. Synthesis

| Finding | Classification | Action |
|---|---|---|
| Every issue-named screen lacks a pinned test | resolved in `46567538`/`a6d388ab`; re-verified at head | — |
| `settings-section` stamp unguarded | resolved (`settings-section.test.tsx`) | — |
| Scanner could pass vacuously | resolved (`files.length > 0` + two-direction self-tests) | — |
| Unbalanced call could be masked | resolved (`-1` sentinel + flag-and-break + self-test) | — |
| `test-utils` scanned as production | resolved (exclusion at `:165-170`) | — |
| Local `MIDNIGHT_CROSSING` leftover | resolved (import now shared) | — |
| `inventory-invoice-details-page` pinned render test | missing, outside the issue's named list | follow-up (not a blocker) |
| Regex/`${…}` blind spot in scanner | heuristic; fails loud, never silent | note only |
| Hoisted-factory literal in `settings-section.test.tsx:17` | required by vitest hoisting | note only |
| Invalid-`checkedAt` branch untested | pre-existing | note only |

**No blockers.** The three delta claims all verify at head:

1. Unbalanced-paren self-test added — `web-hygiene.test.mjs:98`, `:138-143`, `:292-293`; non-vacuous.
2. `test-utils` excluded from the production scan — `:165-170`.
3. `MIDNIGHT_CROSSING` deduped into the shared fixture — declared once at `algeria-day.ts:8`, imported by all six suites; the `a6d388ab` leftover is gone.

**Grade for the `a6d388ab..c330d857` delta: A** — minimal, correct, and each of the three claims closes a gap the previous audit named.
**Grade for the whole #473 sweep at head `c330d857`: B+** — complete and revert-sensitive for every issue-named screen, but one changed screen (`inventory-invoice-details-page`) still has no behavioural pinned test (hygiene-rule-forced change, no wrong-zone guard).

**Recommended follow-up (one test, ~10 minutes):** in `inventory-invoice-details-page.test.tsx`, set `invoiceDate: MIDNIGHT_CROSSING`, pin `TZ=UTC`, and assert the rendered Algeria day (and absence of the UTC day), mirroring `stored-business-day-timezone.test.tsx:139`.
