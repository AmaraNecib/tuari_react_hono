# Debate review — issue #473 (`fix/473-algeria-day-pins`)

- base SHA: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- head SHA: `c330d857d232907f7c14a4bd4a5bb0d7fdbebe2f`
- commits in range: `46567538` (impl) → `a6d388ab` (test-only follow-up) → `c330d857` (this delta)
- reviewer: debate skill (harsh critic + charitable defender + synthesis)
- scope read: `.agents/skills/debate/SKILL.md`, `.scratch/implementation/473-design.md`,
  `git diff d6164c65...c330d857 --stat` (26 files, +992/−41), the full diff of
  `tests/`, `apps/web/src/lib`, `apps/web/src/test-utils`, `apps/web/src/features`,
  the per-commit `--stat` for `c330d857`, the prior debate doc
  `.scratch/reviews/473/a6d388ab-debate.md`, plus targeted greps over
  `apps/web/src` and `package.json`.
- critic focus: the `c330d857` delta (≈+27/−8 across 3 files), plus a confirmation
  pass that the prior no-blocker verdict still holds for the whole range.

Delta under review (exactly what `c330d857` adds on top of the reviewed `a6d388ab`):

| File | Delta |
|---|---|
| `tests/web-hygiene.test.mjs` | `findMatchingParen` returns `-1` instead of `source.length - 1`; new `closeParen === -1` branch flags + `break`s; heuristic-limits doc comment; `listProductionWebSources` also excludes `test-utils`/`__tests__`/`__mocks__`; self-test line for the unbalanced input |
| `apps/web/src/features/stored-business-day-timezone.test.tsx` | local `const MIDNIGHT_CROSSING` deleted, now imported from `@/test-utils/algeria-day` |
| `.scratch/implementation/473-design.md` | `findUnpinnedDateFormatters` signature gains `callee`; Risk bullet names the affected screens and the style-pinning tests |

---

## Prior review findings — verification at `c330d857`

| # | Prior finding (a6d388ab debate) | Severity | Status at this head | Evidence |
|---|---|---|---|---|
| 1 | **C2** scanner blind to `` `${…}` `` interpolations | 4 | **Not fixed — documented only** | `tests/web-hygiene.test.mjs:106-108` now states the limitation ("does not descend into a template literal's `${…}` interpolation (none in `apps/web/src` today)"). `skipString` is unchanged. See N1: the parenthetical is inaccurate. |
| 2 | **C3** unbalanced-paren fallback masked a later `timeZone` | 3 | **Resolved** | `tests/web-hygiene.test.mjs:98` returns `-1`; `:138-142` pushes a violation and `break`s instead of testing `timeZone` over the rest of the file. Self-test at `:294` (`'const a = new Intl.DateTimeFormat("ar-DZ"'.length === 1`) proves the flag. Traced by hand: `matchFormatterAt` matches `new Intl.DateTimeFormat(`, `findMatchingParen` consumes the `"ar-DZ"` string via `skipString`, hits EOF → `-1` → 1 violation, `break`. |
| 3 | **C4** design doc said `{ line; call }`, impl returns `{ line; callee; call }` | 2 | **Resolved** | `.scratch/implementation/473-design.md` "Public API / contracts" now reads `findUnpinnedDateFormatters(source): Array<{ line: number; callee: string; call: string }>` — matches the implementation and the consumer at `tests/web-hygiene.test.mjs:141`. |
| 4 | **C5** numeric→`medium` style change broader than the design said | 3 | **Resolved (documentation)** | Design Risk bullet now enumerates "the inventory invoice list and details pages, outbound transfers, and the debt/salary tables" and notes the TZ-pinned tests pin the `medium` output. Matches the 12 call sites in the diff. PR-body mention remains the parent's job. |
| 5 | **C6** local `MIDNIGHT_CROSSING` re-declaration | 2 | **Resolved** | `stored-business-day-timezone.test.tsx` now imports `MIDNIGHT_CROSSING`; `grep -rn "MIDNIGHT_CROSSING =" apps/web/src` returns exactly one hit: `apps/web/src/test-utils/algeria-day.ts:8`. Fixture is single-sourced. |
| 6 | **C1** unpinned `Date#toLocaleString` instants survive; rule cannot see them | 5 | **Deferred by prior review, accepted** | Out of this lane's brief (stored *business days*). Re-confirmed present: `audit-log-page.tsx:105,215`, `inventory-invoice-details-page.tsx:183`, `use-report-queries.ts:79,94,110`, `report-builder.tsx:107`, `asset-charge-history.tsx:156`. Follow-up issue still owed by the parent. |
| 7 | **C7** `formatAlgeriaDate("")` throws | 2 | **Dismissed (prior)** | Unchanged; parity with the replaced call sites. |

All four prior "Fix it" items are closed or (C2) explicitly re-scoped. Nothing in the delta re-opens a closed item.

---

## CRITIC — findings

Severity: 1 = nit, 10 = must-fix blocker. Test-quality detail is `test-audit`'s lane; these findings are about the implementation and the CI rule (production config).

### N1 — severity 4 — C2 still open, and the new comment's justification is factually wrong
`tests/web-hygiene.test.mjs:106-108` justifies the interpolation blind spot with "(none in `apps/web/src` today)". Date formatters **do** sit inside template interpolations in the scanned tree today:

- `apps/web/src/hooks/use-report-queries.ts:79`, `:94`, `:110` — `` `Generated: ${new Date(r.generatedAt).toLocaleString("ar-DZ")}` ``
- `apps/web/src/features/app-shell/dashboard-section.tsx:80` — `` `${outstandingDebtsDzd.toLocaleString("ar-DZ")} د.ج` ``

The narrow reading ("no *matched* callee — `toLocaleDateString` / `Intl.DateTimeFormat` — is in an interpolation") is true: `grep -E '\$\{[^}]*\.(toLocaleDateString|toLocaleString)\(|\$\{[^}]*Intl\.DateTimeFormat\(' apps/web/src` finds zero `toLocaleDateString` / `Intl.DateTimeFormat` interpolations. So the rule is not currently unsound. But the comment as written asserts a property about date formatters in interpolations, and that property is false; worse, the moment the deferred C1 follow-up adds `toLocaleString(` to `matchFormatterAt`, the three `use-report-queries.ts` lines are invisible by construction and the widened rule reports green on exactly the lines it was widened for. Impact: a comment that will mislead the next author into treating C2 as closed. Cheapest correct action is a one-line wording fix in the same PR (say "no matched callee appears in an interpolation today, but a future `toLocaleString` rule would need interpolation support first"), or carry C2 into the follow-up issue as its first item. Not a behaviour regression, not a blocker for this delta.

### N2 — severity 2 — the unbalanced record stores the whole rest of the file
`tests/web-hygiene.test.mjs:141`: `call: source.slice(index)` — for the unbalanced branch this is the entire remainder of the file, unbounded. The production test only interpolates `${relative}:${line}: ${callee}` (`:246`), so nothing dumps today; the growth and the future-debug dump are the cost. Suggest a bounded window (`source.slice(index, index + 200)`).

### N3 — severity 2 — the unbalanced `break` is fail-closed, which is correct, but files the whole file under one line
`tests/web-hygiene.test.mjs:138-142` stops scanning the file on the first unbalanced call. Directionally right (fail-closed beats silent resync), and the scanner has no regex-literal handling, so a `(` inside a regex inside a formatter's argument list could trip it. Consequence is a CI failure with a misattributed message and the rest of the file unscanned, never a false green. Note only.

### N4 — severity 1 — the new exclusion is broader than the stated intent, but harmless
`tests/web-hygiene.test.mjs:171` drops any path segment `test-utils|__tests__|__mocks__`. Under `apps/web/src` that is exactly three dirs: `apps/web/src/test-utils/` (drops the new `algeria-day.ts` fixture) and `apps/web/src/features/shared/__tests__/`, `apps/web/src/hooks/__tests__/` (both already `.test.ts(x)`-excluded, so no net change). No `__mocks__` dir exists under `apps/web/src`. Every dropped file is test-only or already excluded; no production reader left the scan. The `files.length > 0` guard at `:245` still holds (`apps/web/src` has ~100+ production sources).

### Carried, re-confirmed (not new)
- **C1** (sev 5, deferred) — unpinned `.toLocaleString("ar-DZ")` instant renders still live at the greps above. Out of this lane (business days); needs the follow-up issue. Note the delta makes C2 a *precondition* of widening the rule (N1).
- **C7** (sev 2, dismissed) — `formatAlgeriaDate("")` → `RangeError`; parity with the replaced `new Date(x)` call sites.

---

## DEFENDER — what the delta does right

| # | Defense | Confidence |
|---|---|---|
| D1 | The unbalanced branch fixes the exact false-negative C3 named, in the right direction: return `-1` (`:98`) → flag → `break` (`:138-142`). A truncated file now fails loudly instead of hiding an unpinned call behind a later `timeZone`. Fail-closed is the correct polarity for a hygiene gate. | 9 |
| D2 | The fix is proven by a self-test in the same commit (`:293-294`), so the new branch cannot rot silently — the scanner's own suite would catch a revert to `source.length - 1`. That is the pattern the whole rule is built on. | 9 |
| D3 | Single-source `MIDNIGHT_CROSSING` closes the last duplicate fixture: `grep` finds exactly one declaration in the tree. The stored-business-day suite now cannot drift from the rest of the harness if the fixture instant moves. | 9 |
| D4 | The `callee`/screens doc edits (`473-design.md` Public API + Risks) make the next reviewer's diff match the code — the contract now reads `{ line; callee; call }` exactly as implemented and consumed (`tests/web-hygiene.test.mjs:141`). | 8 |
| D5 | The new exclusion is a correctness improvement, not a loosening: `test-utils/algeria-day.ts` is a test fixture and the design doc always scoped the rule to "production web source … excluding tests". Nothing production leaves the scan (N4). | 8 |
| D6 | The heuristic-limits comment (`:106-108`) is the honest move for a text-level scanner: it states the `${…}` gap, the spread/string `timeZone` acceptance, and the intent ("catch a re-added bare call, not to be a type checker"). The parenthetical is wrong (N1), but disclosing the limitation rather than hiding it is the right instinct. | 6 |
| D7 | The delta is minimal and only test/config/doc: no production behaviour touched, no reader re-plumbed, so it cannot regress the shipped fix from `46567538`. | 8 |
| D8 | Range-level integrity still holds: production scan is clean — the only remaining `toLocaleDateString(`/`Intl.DateTimeFormat(` sites in non-test `apps/web/src` are the four pinned optioned formatters (`transfer-history-page.tsx:17`, `location-transfer-history.tsx:15`, `license-settings.tsx:47`, `home-view-derived-formatters.ts:19`) and `algeria-time.ts:35,47,61`, all of which pass `timeZone`. | 8 |

---

## Synthesis — classification and required action

| Finding | Severity | In this lane's scope? | Decision |
|---|---|---|---|
| N1 C2 open + misleading "none today" justification | 4 | Yes (rule is production config; C2 was a prior "Fix it") | **Fix wording now (1 line) or carry C2 as item 1 of the C1 follow-up issue.** Not a blocker: rule is currently sound (no matched callee in an interpolation). |
| N2 unbalanced record stores rest-of-file | 2 | Yes | **Fix it (cheap)** — bounded slice. |
| N3 unbalanced `break` fail-closed, misattributes location | 2 | Yes | **Dismiss** — fail-closed is the right polarity; no false green. |
| N4 exclusion broader than intent, no production file lost | 1 | Yes | **Dismiss** — audited: 3 dirs, all test-only/already excluded. |
| C1 unpinned `.toLocaleString` instants | 5 | No (prior review deferred; out of lane) | **Defer** — parent opens the follow-up issue, references PR #473, and now must also record the C2/precondition note from N1. |
| C2 scanner interpolation blind spot | 4 | Yes | **Defer with explicit mention** in the same follow-up issue (documented at `:106-108`; no live false negative under today's callee set). |
| C5 PR-body style-change callout | 3 | Yes (parent) | **Parent action** — PR body should name the affected screens (design doc now does). |
| C7 `formatAlgeriaDate("")` throws | 2 | Yes | **Dismiss** — parity with replaced code. |
| C3, C4, C6 | 2-3 | Yes | **Closed by `c330d857`** — no further action. |
| D1–D8 | — | — | **No action** — design decisions stand. |

**Verdict: no blocker (no finding ≥ 8). The prior no-blocker verdict still holds for the full range `d6164c65..c330d857`.** The delta strictly improves the range: it closes C3, C4, C6 and the C5 documentation gap, and it introduces no new behavioural risk (test/config/doc only). N1 is the only item worth acting on before push if it is one line of prose; otherwise it belongs in the follow-up issue alongside C1 and C2.

---

## Not run / residual risk

- Per the CPU-bound instruction I ran **no** suites (`pnpm test`, turbo, vitest, Playwright). Evidence is from reading the diff, hand-tracing the scanner over the new self-test inputs, and greps. The self-test's pass status at `c330d857` is **asserted by the commit, not reproduced by me**; I verified the branch logic by hand (unbalanced sample → exactly 1 violation at line 1, balanced nested sample → 0).
- Playwright snapshots for the inventory lists/details screens were not inspected (C5); if any snapshot exists it needs refreshing per the prior review.
- `expenseDate` / `purchaseDate` readers were not individually traced; the range-level grep shows no bare matched callee left in non-test production source outside the pinned paths.
- The follow-up issue for C1 (+ C2, + the N1 precondition note) is the only owed artefact; the parent owns opening it and referencing PR #473.
