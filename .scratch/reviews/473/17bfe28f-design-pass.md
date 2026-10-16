# Design pass — issue #473 (head `17bfe28f`)

Applied `domain-modeling`, `codebase-design`, and
`improve-codebase-architecture` to the round-2 and round-3 delta
(`c330d857d232907f7c14a4bd4a5bb0d7fdbebe2f...17bfe28f94365b2c13b0aa7ea65c088224e009d8`).
The full-PR pass is `c330d857-design-pass.md`; this file records the changed
disposition. `215cb923-design-pass.md` records the round-2 delta separately.

## Domain modeling

- The canonical-day rule is now stated **once**, in
  `apps/web/src/lib/algeria-time.ts` as the exported predicate
  `isAlgeriaCalendarDay`. `toAlgeriaDayBoundaryIso` returns `undefined` when it
  is false; `date-range.ts` throws when it is false. Two call-site contracts,
  one rule — the round-2 diff had grown a second copy of the regex + round-trip
  inside `date-range.ts`, which this round removed.
- The doc comment on `toAlgeriaDayBoundaryIso` now matches the code: an
  anchored `yyyy-MM-dd` parse, so `2026-10-15junk` and an ISO instant string no
  longer coerce to a different day. The prior comment described the pre-strict
  behaviour's *intent*, which the code did not enforce.
- `settings-section.test.tsx` reads `LAST_CHECKED_LABEL` from
  `ar.translation.shell.settingsLastChecked`, and its comment no longer claims
  the mock guards the stamp line (that label arrives as a prop); it states what
  the mock actually guards.

## Codebase design

- **Deletion test:** `isAlgeriaCalendarDay` has two real consumers with
  different failure contracts (`undefined` vs throw), and deleting it
  re-duplicates the calendar rule in `date-range.ts`. It passes. The old local
  `isCanonicalDay` wrapper in `date-range.ts` was itself a shallow pass-through
  after the extraction and was deleted — the call site names the predicate
  directly.
- **Seam:** the round trip on `Date.UTC` remains the single oracle for calendar
  validity (leap years and month lengths are correct by construction). The
  anchor regex is the format gate in front of it; neither duplicates the other.
- **Duplication this diff introduced and then removed:** the calendar predicate
  (round 2 → removed in round 3). The i18n `t` mock is still copy four
  (`backup-settings`, `license-settings`, `update-section`, `settings-section`)
  and remains **deferred to the parent** — collapsing it touches four suites
  outside this lane's two-finding brief. See the crew handoff's
  `decisionRequest`.
- **No shallow module introduced:** `isAlgeriaCalendarDay` is a rule with two
  consumers; the settings test's mock is unchanged in shape from its siblings.

## Improve-codebase-architecture (friction this diff created)

- Tightening the parse is fail-closed: every traced caller feeds
  `DatePicker`-canonical `yyyy-MM-dd` (the picker's `format(date, "yyyy-MM-dd")`
  and `salary-payment-form.ts`'s padded synthesis), so no live path supplies a
  previously-lenient string. Callers already treat the return as
  `string | undefined`.
- Years `0`–`99` are rejected by the `Date.UTC` round trip (two-digit remap).
  No stored business day is in that range and no caller produces one; the debate
  and test audit both dismiss it, and the direction is safe. Not fixed here.
- The `date-range.ts` stale sentence is gone with the predicate it described, so
  there is no longer a comment that names behaviour the callee does not have.

## Outcome

- Fixed across rounds 2–3: real calendar validation with tests; the anchored
  canonical parse; the resource-backed translation mock; and the calendar rule
  single-sourced between `algeria-time.ts` and `date-range.ts`.
- Deferred with a parent decision requested (no silent deferral): single-sourcing
  the resource-backed `useTranslation` mock into a shared test fixture.
- Review evidence: `17bfe28f-debate.md`, `17bfe28f-code-review.md`,
  `17bfe28f-test-audit.md`.
