# Code review — issue #473 (`fix/473-algeria-day-pins`) — FINAL head

- reviewed HEAD: `c330d857d232907f7c14a4bd4a5bb0d7fdbebe2f`
- fixed point (base): `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- lane commits: `46567538` (fix) + `a6d388ab` (tests) + `c330d857` (test hardening/doc, FINAL)
- reviewer mode: **review-only, CPU-bound** — no suite run; inspection + `git diff`/grep only
- spec source: `.scratch/implementation/473-design.md` (GitHub #473 not fetched — local/offline mode)
- standards sources: `AGENTS.md`, `.agents/skills/code-review/SKILL.md` + SKILL smell baseline

## Diff under review

`git diff d6164c65...c330d857 --stat` — 26 files, **+992 / −41**.

| file | + | note |
| --- | --- | --- |
| `.scratch/implementation/473-design.md` | 109 | design record (committed per AGENTS.md) |
| `apps/web/src/lib/algeria-time.ts` | 30/−? | helper widened + JSDoc restructure |
| `apps/web/src/test-utils/algeria-day.ts` | 39 | new shared TZ fixture |
| `tests/web-hygiene.test.mjs` | 219/−? | scanner + rule + self-tests |
| 10 production reader modules | ~2 each | import + pinned call |
| 6 test suites + `algeria-time.test.ts`, `stored-business-day-timezone.test.tsx` | — | TZ-pinned assertions |

### Delta since last review `a6d388ab` (114 diff lines)

1. **Scanner unbalanced-paren hardening** — `findMatchingParen` now returns `-1` on
   unbalanced input (was `source.length - 1`); `findUnpinnedDateFormatters` flags a
   violation and `break`s when it sees `-1`, so a later `timeZone` cannot mask an
   unbalanced file. Self-test added: `findUnpinnedDateFormatters('const a = new Intl.DateTimeFormat("ar-DZ"').length === 1`.
2. **`test-utils` exclusion** — `listProductionWebSources` now filters out
   `(^|[/\\])(test-utils|__tests__|__mocks__)[/\\]`, so the rule scans shipped web source only.
3. **`MIDNIGHT_CROSSING` dedup** — the leftover local literal in
   `stored-business-day-timezone.test.tsx:31` was removed; the file now imports it from
   the shared fixture. This closes the prior review's Standards *Duplicated Code* note.
4. **Doc wording** — design "Public API" signature widened to include `callee`; Risks
   paragraph now names the visual-change surfaces and the `medium`-assertion guard.

All 3 residual items from the `a6d388ab` review are now addressed (leftover dup constant,
documented blind spot, globally-added non-vacuity).

---

## Requested confirmations (FULL diff)

### 1. One pinned helper everywhere — PASS

- `formatAlgeriaDate(value: string | Date, locale = "ar-DZ")` widened at
  `apps/web/src/lib/algeria-time.ts:59-65`; zone still hard-pinned
  (`timeZone: ALGERIA_TIME_ZONE`, line 63). Callers pass the stored value directly —
  no per-site `new Date(…)` wrapper and no `timeZone` to forget.
- All production `toLocaleDateString(` / `new Intl.DateTimeFormat(` call sites pass a
  `timeZone` (grep over `apps/web/src`, tests/`test-utils` excluded):
  `lib/algeria-time.ts:35,47,61`; `app-shell/home-view-derived-formatters.ts:19`;
  `inventory/transfer-history-page.tsx:17`; `inventory/location-transfer-history.tsx:15`;
  `license/license-settings.tsx:47`. **Zero unpinned production calls.**
- `settings-section.tsx:140` renders `checkedAt`, an *instant*, via the pinned
  `formatDateTimeInAlgeria(date)` (`algeria-time.ts:46-52`) — matches the design.
- Deletion test holds: removing the helper re-scatters the 13 reader call sites.

### 2. Optioned formatters keep options + pinned zone — PASS (4/4)

| site | pin |
| --- | --- |
| `app-shell/home-view-derived-formatters.ts:23` | `timeZone: getAlgeriaTimeZone()` |
| `inventory/location-transfer-history.tsx:19` | `timeZone: getAlgeriaTimeZone()` |
| `inventory/transfer-history-page.tsx:21` | `timeZone: getAlgeriaTimeZone()` |
| `license/license-settings.tsx:51` | `timeZone: getAlgeriaTimeZone()` |

Each gained the `getAlgeriaTimeZone` import; the zone is single-sourced at
`algeria-time.ts:68`, not re-typed per site.

### 3. Hygiene rule + non-vacuous self-test — PASS

- Rule: `findUnpinnedDateFormatters(source)` — char walker skipping line/block comments
  and string/template literals; matches only `toLocaleDateString(` and
  `(new )?Intl.DateTimeFormat(`; balances the call's parens (nested strings/comments
  skipped) then requires `\btimeZone\b`.
- Production rule test asserts `files.length > 0` (`tests/web-hygiene.test.mjs`, "must find
  source files") so an empty/filter-drifted scan cannot pass vacuously.
- Self-test is real: 3 pinned samples → `[]`; 2 unpinned → callees
  `['toLocaleDateString','Intl.DateTimeFormat']` **and** lines `[1,2]`; comment/string
  mentions → `[]`; nested parens/strings → `[]`; **unbalanced input → length 1** (new).
- `test-utils` now excluded from the scan (delta #2) — appropriate: it is test-only support,
  and `dayIn` passes its `timeZone` explicitly anyway.

### 4. TZ-pinned per-screen tests incl. settings-section — PASS

- New `apps/web/src/features/app-shell/settings-section.test.tsx` (128 lines) forces the
  desktop "system" tab (`window.history.replaceState({}, "", "/?tab=system")`), mocks
  `./use-update-check` with `checkedAt: "2026-09-30T23:00:00.000Z"`, and asserts
  `آخر فحص: <Africa/Algiers medium+short stamp>` present / UTC stamp absent, with a
  non-vacuity guard (`resolvedOptions().timeZone === "UTC"`).
- `stored-business-day-timezone.test.tsx` (new, 145 lines) covers `formatAlgeriaDate`,
  `formatDateLabel`, `TransferHistoryPage`, `LocationTransferHistory`,
  `OutboundTransfersPage`, `InventoryInvoicesPage` under `TZ=UTC`.
- In-place pinned assertions added: `salaries-section.test.tsx` (payment history +
  workers `lastPaymentDate`), `employee-details-page.test.tsx` (salary history),
  `license-settings.test.tsx` (`_LONG`), `debts-mvp-web.test.tsx` (ledger / consolidation
  `toHaveLength(2)` / void / record-payment). Every suite carries a
  `ALGERIA_DAY !== UTC_DAY` non-vacuity assertion.

### 5. Shared fixture — PASS

- `apps/web/src/test-utils/algeria-day.ts` single-sources `MIDNIGHT_CROSSING`,
  `dayIn`, the six day constants, and `pinUtcTimeZone()` (save/restore of `process.env.TZ`,
  `undefined` handled via `delete`). 7 test files import it.
- Dedup completed in the FINAL commit: the last local `MIDNIGHT_CROSSING` literal is gone.
  `settings-section.test.tsx` still hardcodes the instant inside the hoisted `vi.mock`
  factory — justified (hoisting precludes a top-level import reference).

### 6. Issue item 4 out of lane — CONFIRMED

The design doc's "Scope note (not in this lane)" defers the expenses current-month quick
filter / KPI label. No expenses-filter code appears in the diff — correctly absent.

---

## Standards verdict

**PASS** — no hard violations. 1 judgement call, 1 documented limitation, 1 process note.

- **Documented standards:** `AGENTS.md` respected — no `git add -A` noise, no staged files
  (worktree only has untracked `.scratch/reviews/473/`), design doc committed as
  `.scratch/implementation/473-design.md`, review evidence under `.scratch/reviews/473/`.
- **Smell baseline:** the prior *Duplicated Code* finding (leftover `MIDNIGHT_CROSSING`
  literal) is **resolved** in `c330d857`. No Feature Envy / Shotgun Surgery / Divergent
  Change introduced. The widened `string | Date` parameter is not Speculative Generality —
  it removes the per-site `new Date(…)` that enabled the bug.
- **Judgement call (limitation, not a defect):** the scanner guards only
  `toLocaleDateString` / `Intl.DateTimeFormat`. A bare `toLocaleString()` — the *shipped
  shape* of the `settings-section.tsx` bug — is not scanned, so that class can recur
  unguarded. The delta now documents this as a text-level heuristic limitation in the
  scanner JSDoc (`timeZone` via spread/string also counts; no `${}` descent). The remaining
  `new Date(x).toLocaleString("ar-DZ")` sites (`audit-log-page.tsx:105,215`,
  `asset-charge-history.tsx:156`, `inventory-invoice-details-page.tsx:183`,
  `report-builder.tsx:107`, `use-report-queries.ts:79,94,110`) render *instants*, outside
  #473's business-day field list — defensible, but the guard's breadth is narrower than the
  issue's problem statement.
- **Process note:** the `AGENTS.md` merge-gate artifact
  `.scratch/reviews/473/<HEAD>-design-pass.md` (filename must contain the reviewed SHA) is
  not present for `c330d857`. Out of this review's scope to author, but it is a merge gate.
- _Worst on this axis:_ the `toLocaleString` blind spot (documented heuristic limitation).

## Spec verdict

**PASS** — items 1–3 delivered as written; item 4 explicitly and correctly out of lane.

- "One pinned helper for a stored business day" → delivered; semantics match (widened
  parameter, same return, same pinned zone); every reader uses it.
- "Optioned formatters keep their options and take the pinned zone" → 4/4 as named.
- "Hygiene rule" + "self-tested, cannot pass vacuously" → delivered, exceeding the design
  (extra `files.length > 0` guard, unbalanced-input case, comment/string false-positive cases).
- "TZ-pinned tests" → delivered, including the settings-section screen the design singled out;
  the FINAL delta replaces the last inline constant with the shared fixture.
- "Scope note (not in this lane)" → item 4 recorded as deferred, not silently dropped.
- _Worst on this axis:_ none — no missing or partial requirement; no unrequested behaviour.
- _Limitation:_ graded against `.scratch/implementation/473-design.md` + commit messages
  (remote issue #473 not fetched). Any issue-body requirement not mirrored in the design doc
  is not covered by this verdict.

---

## Blockers

None.

## Residual risks

1. **No suite executed** (CPU-bound instruction + explicit "do NOT run any full suite").
   Verdicts are static. The new `settings-section.test.tsx` path (tab `"system"`, label
   `آخر فحص`, `isDesktopRuntime() === true`) is inferred from source, not observed green.
2. **Scanner blind spots** (documented): bare `toLocaleString` / `toLocaleTimeString`, a
   `timeZone` supplied via spread, or a `"timeZone"` string anywhere inside the call would
   satisfy/escape the regex.
3. **`debts-mvp-web.test.tsx` `toHaveLength(2)`** couples the assertion to the consolidation
   dialog's date-line count — brittle if the dialog gains another date line.
4. **`process.env.TZ` is process-wide**; the fixture restores it in every `afterEach`, so no
   leak is expected, but any new TZ-pinned suite must use `pinUtcTimeZone()` rather than
   setting `TZ` inline.

## Bottom line

- **Standards:** PASS (0 hard violations, 1 judgement call, 1 documented limitation).
- **Spec:** PASS (0 missing/partial, 0 scope creep).
- Both axes clean; no blocker. The FINAL commit closed every item the prior `a6d388ab`
  review raised.
