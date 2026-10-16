# Design pass — issue #473 (head `c330d857`)

Applied `domain-modeling`, `codebase-design`, and
`improve-codebase-architecture` to this PR's diff
(`d6164c651a42be41f5b4824a53fa88e06e8a1ffa...c330d857d232907f7c14a4bd4a5bb0d7fdbebe2f`).
This is the merge-gate record; "nothing found" is not the case here, so the
findings and their disposition follow.

## Domain modeling

- The vocabulary is now stated once, in the module the readers import:
  `apps/web/src/lib/algeria-time.ts` opens with "Africa/Algiers is UTC+1
  year-round (no DST). A stored business day must be rendered in this zone".
  The four exports map one-to-one onto four concepts: `toAlgeriaDayBoundaryIso`
  (day → inclusive instant range), `getAlgeriaDateInputValue` (instant →
  canonical `yyyy-MM-dd` key), `formatAlgeriaDate` (**stored business day** →
  human day), `formatDateTimeInAlgeria` (**stored instant** → day + time).
- The diff respects the distinction rather than flattening it:
  `settings-section.tsx` renders an update-check *instant* and calls
  `formatDateTimeInAlgeria`, not `formatAlgeriaDate`.
- Residue (recorded, not fixed): `formatAlgeriaDate` and
  `formatDateTimeInAlgeria` share the `Algeria` prefix and do not say
  *business-day* vs *instant* in the name. A rename would ripple over ~13 call
  sites for a naming-only change; the module doc carries the meaning. Filed as
  a vocabulary note, not a task.

## Codebase design

- **Deletion test:** deleting `formatAlgeriaDate` re-scatters 13 production call
  sites and both the zone and the style choice; it is the single configuration
  point for the business zone. It passes. It is a policy module, not an
  information-hiding module, and that is the right shape here.
- **Seam:** the web hygiene rule (`tests/web-hygiene.test.mjs`) states the
  "never format a stored day without a zone" invariant once and self-tests it
  (pinned / unpinned / comment / nested / unbalanced), so the invariant cannot
  rot into a name-based search. Real seam, not hypothetical.
- **Duplication this diff introduced and then removed:** the first pass copied
  the TZ test harness into six suites. The design pass caught it; it is now
  single-sourced in `apps/web/src/test-utils/algeria-day.ts` (one
  `MIDNIGHT_CROSSING`, one `dayIn`, one `pinUtcTimeZone`), with no leftover
  `process.env.TZ` assignment outside the fixture.
- **Shallow-but-pre-existing:** `getAlgeriaTimeZone()` is a function returning a
  literal. It shipped in #472 and the issue text explicitly asks call sites to
  pass `timeZone: getAlgeriaTimeZone()`, so changing it is unrequested churn.
  Left as-is.

## Improve-codebase-architecture (friction this diff created)

1. **The rule is narrower than the problem statement.** `toLocaleString()` on an
   instant — the exact shape the diff fixed in `settings-section.tsx` — is not
   covered, because a text rule cannot separate `date.toLocaleString()` from
   `amount.toLocaleString()` (the repo has 31 `toLocaleString` calls, mostly
   money). Seven unchanged instant readers still format in the ambient zone
   (`audit-log-page.tsx:105,215`; `asset-charge-history.tsx:156`;
   `inventory-invoice-details-page.tsx:183`; `report-builder.tsx:107`;
   `use-report-queries.ts:79,94,110`). These are out of this lane's brief
   (issue Task 2 names only the two APIs; the issue's business-day list does not
   include audit/report timestamps). **Deferred to the parent** — see the crew
   handoff's `decisionRequest`.
2. **One changed site has no behavioural test.**
   `inventory-invoice-details-page.tsx:77` was converted to
   `formatAlgeriaDate(detail.group.invoiceDate)` because the hygiene rule forced
   it (the issue did not name this screen). Its existing suite feeds a mid-day
   instant, so only the static rule guards it. A wrong-zone regression would slip
   past both the rule and the test. **Deferred to the parent** as a one-test
   follow-up.

The diff leaves the codebase better than it found it: the six-way test
duplication it introduced was removed before merge, the invariant is
single-sourced in `algeria-time.ts`, and the fetching duplication is guarded by
a self-tested rule. Neither deferred item is a regression this diff introduced.

## Outcome

- Fixed in this PR: the TZ-harness duplication; the mangled docstrings the diff
  exposed in `algeria-time.ts` and `home-view-derived-formatters.ts`.
- Deferred with a parent decision requested (no silent deferral): the
  `Date#toLocaleString` instant sweep + rule widening, and the
  `inventory-invoice-details-page` pinned test.
- Review evidence: `c330d857-debate.md`, `c330d857-code-review.md`,
  `c330d857-test-audit.md`.
