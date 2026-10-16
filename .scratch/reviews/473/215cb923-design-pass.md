# Design pass — issue #473 (head `215cb923`)

Applied `domain-modeling`, `codebase-design`, and
`improve-codebase-architecture` to the round-2 delta
(`c330d857d232907f7c14a4bd4a5bb0d7fdbebe2f...215cb923af30584d409995abcf5f0830abc3d143`),
which answers the two Greptile findings on PR #485. The full-PR pass is
`c330d857-design-pass.md`; this file records only what the round-2 diff changed.

## Domain modeling

- The calendar-validity rule now means what the module says. Before, the doc
  promised "a valid calendar day" while the code only rejected non-finite
  parts, so `2026-02-30` was silently normalized into March. The rule
  ("a boundary exists only for a real `yyyy-MM-dd` day") is stated once, in
  `toAlgeriaDayBoundaryIso`, and the doc comment names the failure mode
  ("rejected, not normalized into March") instead of a generic adjective.
- `settings-section.test.tsx` no longer carries a private copy of the label
  string. `LAST_CHECKED_LABEL` is read from `ar.translation.shell.settingsLastChecked`,
  so the resource — not the test — owns the vocabulary.
- No new domain term was introduced; nothing to single-source elsewhere.

## Codebase design

- **Deletion test on the new validation:** the round-trip check is inlined in
  `toAlgeriaDayBoundaryIso` rather than extracted as `isValidCalendarDay`. It has
  one caller and would be a two-line function; extraction would add indirection
  without hiding anything. Inlining passes.
- **Seam:** the check reuses `Date.UTC`'s own normalization as the oracle
  (`getUTCFullYear/Month/Date` equal to the parsed parts) instead of a hand-rolled
  days-per-month table. That is the existing seam for date math, and it keeps
  leap-year handling correct by construction (`2028-02-29` accepted) rather than
  by a second rule that could drift.
- **Duplication this diff added (recorded, not fixed):** the resource-backed
  `useTranslation` mock is now copy four — `backup-settings.test.tsx`,
  `license-settings.test.tsx`, `update-section.test.tsx`, and now
  `settings-section.test.tsx`. The body is identical modulo a two-arg vs
  three-arg signature. `.agents/wisdom/testing.md` mandates the behaviour, but no
  shared fixture owns it, so the five copies can drift. A `test-utils` factory
  would single-source it. **Deferred to the parent** — see the crew handoff's
  `decisionRequest`; collapsing it touches four suites outside this lane's
  two-finding brief, which is exactly the "fix would sprawl" case.
- **No shallow module introduced:** the diff adds no export.

## Improve-codebase-architecture (friction this diff created)

- The `settings-section` mock change is a strict improvement: the suite now
  fails when the resource key is renamed, which is the actionable signal the
  Greptile finding asked for. The cost is the fourth copy above.
- The `toAlgeriaDayBoundaryIso` change tightens a previously lenient contract.
  Callers already treat the return as `string | undefined` (the debts panels pass
  the result straight through), so a stricter `undefined` needs no caller change.
  The picker only emits canonical zero-padded days, so no live caller passes an
  invalid one.
- Year `0`–`99`: `Date.UTC(99, ...)` remaps to 1999, so the round trip rejects
  those inputs. They are not real business days and no caller produces them; the
  behaviour is recorded in the test audit, not treated as a defect.

## Outcome

- Fixed in this diff: the doc/behaviour mismatch in `toAlgeriaDayBoundaryIso`
  (real calendar validation, with tests) and the fallback-only translation mock
  in `settings-section.test.tsx`.
- Deferred with a parent decision requested (no silent deferral): single-sourcing
  the resource-backed `useTranslation` mock into a shared test fixture.
- Review evidence: `215cb923-debate.md`, `215cb923-code-review.md`,
  `215cb923-test-audit.md`.
