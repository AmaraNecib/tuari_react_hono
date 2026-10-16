# Design pass — issue #473 (head `7bc46641`)

Applied `domain-modeling`, `codebase-design`, and
`improve-codebase-architecture` to the gate-fix delta
(`17bfe28f94365b2c13b0aa7ea65c088224e009d8...7bc4664177f7306b76d7a0cdff3eb69e63800f57`).
The full-PR passes are `c330d857-design-pass.md` (round 1) and
`17bfe28f-design-pass.md` (rounds 2–3); this file records only what the
gate fixes changed.

## Domain modeling

- **"Pinned" now means what the module said it meant.** Before, the rule treated
  the *token* `timeZone` as a pin, so `{ timeZone: undefined }`, `{ timeZone: "" }`
  and a comment mention passed. The rule is now stated once, as
  `PINNED_TIME_ZONE_PATTERN` in `tests/web-hygiene.test.mjs`: the option with a
  usable value (or the `{ timeZone }` shorthand). The scanner docstring names the
  failure mode instead of restating the code.
- **`formatAlgeriaDate`'s contract gained its failure mode.** The doc now says it
  returns `—` for a value that is not a parsable date; that is the placeholder
  `backup-settings.tsx:25-27` already uses, so the vocabulary is shared.
- **The test name stopped overclaiming.** `every production web date formatter is
  pinned to a timezone` became `production web source never calls
  toLocaleDateString() or Intl.DateTimeFormat() unpinned` — it now names the two
  APIs it enforces, which is what issue #473 Task 2 asked for.
- The fixture doc now matches the instant: `MIDNIGHT_CROSSING` *is* Algeria
  midnight of the next day, not an hour before it.

## Codebase design

- **Deletion test on `PINNED_TIME_ZONE_PATTERN`:** one consumer, but it is the
  single statement of a rule the docstring explains; inlining it would bury the
  meaning in a condition. It passes.
- **The nested-call fix is a seam correction, not a module.** `index = closeParen + 1`
  existed to avoid re-matching a call's own callee; stepping one character
  achieves that (identifier-prefix guard) *and* lets an unpinned call inside a
  pinned one be seen. Matching at `Intl` instead of `new Intl` removes the only
  double-count that change exposed, and the comment records why.
- **Duplication this delta adds (recorded, not fixed):** "unparsable date → `—`"
  now lives in two helpers — `formatAlgeriaDate` (business day) and
  `backup-settings.tsx`'s local guard (instant). They render different things and
  do not collapse into one function; a shared `isParsableDate` predicate would be
  the single-source. Deleting either guard would re-introduce a crash. Deferred
  (small, not on this fix's critical path).
- **No shallow module introduced:** the delta adds no export.

## Improve-codebase-architecture (friction this delta created)

- The scanner is still a hand-rolled lexer with two documented blind spots
  (regex literals containing a quote; `${…}` interpolation). The delta makes them
  explicit and names the covered APIs, so a reader is not misled — but the real
  resolution is an ESLint `no-restricted-syntax` rule. **Deferred to the parent**
  (see the debate's C1/C5).
- The remaining friction is a policy gap, not code: audit/report instants still
  render in the machine zone. That needs a written policy before a rule can
  enforce it. **Deferred to the parent** with the site list.
- No caller regressed: the invalid-date placeholder only fires on data that
  previously threw, and the focused suites pass.

## Outcome

- Fixed in this delta: the usable-value `timeZone` rule; the nested-call blind
  spot; the invalid-date `RangeError`; the details-page TZ coverage gap; the
  scanner's file-type/`__test-utils__` filters; the two doc mismatches; the
  overclaiming test name.
- Deferred with a parent decision requested (no silent deferral): (1) extend the
  rule to `new Date(...).toLocaleString`/`toLocaleTimeString`, date-fns `format`
  and an ESLint rule, with an explicit instant-rendering policy; (2) collapse the
  duplicated resource-backed `useTranslation` test mock; (3) a shared
  `isParsableDate` predicate.
- Review evidence: `7bc46641-debate.md`, `7bc46641-code-review.md`,
  `7bc46641-test-audit.md`.
