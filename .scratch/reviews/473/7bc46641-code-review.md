# Code review — issue #473 (head `7bc46641`)

Two-axis review of the full PR diff
`d6164c651a42be41f5b4824a53fa88e06e8a1ffa...17bfe28f94365b2c13b0aa7ea65c088224e009d8`
(round-2 gate HEAD), plus the fixes that gate produced, committed at
`7bc4664177f7306b76d7a0cdff3eb69e63800f57`. Axes ran in separate fresh contexts.

- Standards: `33bf9d7c-c7ce-4822-8a84-7be8345da214`
- Spec: `8c075d02-8815-4c32-9b23-d9620085957f`

## Standards axis

Documented standards: **pass, no hard violations.** The diff touches only
`apps/web/**`, `tests/**` and the current-issue `.scratch/{implementation,reviews}/473/`
paths, so AGENTS.md staging discipline holds. The scanner follows
`.agents/wisdom/testing.md`'s anti-vacuity pattern (`assert.ok(files.length > 0)`
plus an explicit self-test).

Baseline smells (judgement calls):

| Finding | Disposition |
|---------|-------------|
| Duplicated Code: four optioned per-file formatters (`location-transfer-history.tsx:15`, `transfer-history-page.tsx:15`, `license-settings.tsx`, `home-view-derived-formatters.ts`) rather than one `formatAlgeriaDate(value, options?)`. | **Dismissed.** Task 1 of the issue instructs exactly this shape ("where a formatter takes options, pass `timeZone: getAlgeriaTimeZone()`"), and each site keeps its own style. The design pass at `c330d857` recorded the choice. Not a standards breach. |
| Guard completeness: the rule bans only `toLocaleDateString` / `Intl.DateTimeFormat`. | **Accepted**; the in-PR overclaim is fixed at `7bc46641` (test renamed), the expansion is deferred (see debate C1). |
| Residual risk: no Playwright coverage for the changed rendering. | **Judgement call.** The seam is unit-pinned under `TZ=UTC`; e2e for user-facing behaviour is a pre-existing gap for these screens, not introduced here. |
| Message Chains / Middle Man / Speculative Generality | Checked, none. |

## Spec axis (issue #473, `.scratch/implementation/473-design.md`)

Reader sweep: **complete.** Every named reader carries a pinned formatter
(`transfer-history-page.tsx:19`, `location-transfer-history.tsx:17`,
`license-settings.tsx:49`, `home-view-derived-formatters.ts:22`,
`settings-section.tsx:140`, `inventory-invoices-page.tsx:134`,
`inventory-invoice-details-page.tsx:77`, `outbound-transfers-page.tsx:114`, the
four debts files, both salary tables, `employee-details-page.tsx:518`). No bare
`toLocaleDateString(` / `new Intl.DateTimeFormat(` survives in production source.

| Spec finding | Disposition |
|--------------|-------------|
| **Partial** — the new TZ suite renders 6 readers, not "each touched reader"; debts/salaries/employee/license/settings rely on in-place suites (the spec allows this). | **Dismissed** as written-in-spec. |
| **Partial** — `inventory-invoice-details-page.tsx:77` had no behavioural TZ test. | **Fixed** at `7bc46641`: a `TZ=UTC` assertion added to `inventory-invoice-details-page.test.tsx`, asserting the Algeria day and not the UTC day. |
| **Gap** — `expenseDate` / `purchaseDate` readers unnamed; covered implicitly (pinned in #472) / write-only. | **Dismissed**, no actionable change. |
| **Scope creep** — `date-range.ts` + `isAlgeriaCalendarDay` (anchored parse, impossible-day rejection) is not in the design's Public API list. | **Dismissed.** It is round-3 hardening required by the design's own "the helper must not silently roll `2026-02-30` into March" contract; it is documented in the committed `c330d857` evidence and in `17bfe28f-design-pass.md`. |
| **Suspect** — the scanner skipped a call's body (`index = closeParen + 1`), so an unpinned call nested inside a pinned call escaped, contradicting the rule's stated "no … call whose balanced parentheses do not contain `timeZone`". | **Fixed** at `7bc46641`: the scan steps one character; matching at `Intl` rather than `new Intl` keeps `new Intl.DateTimeFormat(` single-count. Self-test added. |
| **Suspect** — `${…}` interpolation skipped wholesale. | **Deferred**, documented limitation (debate C4). |
| Expenses-bar item 4 correctly absent from the diff. | Confirmed. |

## Summary

- Standards: no hard violations; one Duplicated Code judgement call dismissed
  against an explicit issue instruction.
- Spec: one real gap (details-page test) and one real rule hole (nested call),
  both fixed at `7bc46641`; the remaining items are documented deferrals.
