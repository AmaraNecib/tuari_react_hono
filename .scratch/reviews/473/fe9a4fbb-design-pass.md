# Design pass — issue #473 (head `fe9a4fbb`)

Applied `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
to the whole PR diff (`d6164c65...fe9a4fbb`), with the round-4 delta
(`f104f403...fe9a4fbb`, the hygiene-scanner fix) under the microscope.

- mode: remote
- base SHA: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- reviewed HEAD: `fe9a4fbb61cbce0449427744c29a9c1e4231490b`
- tier: Standard

## Domain-modeling

The PR keeps one word per concept: `toAlgeriaDayBoundaryIso` /
`isAlgeriaCalendarDay` / `getAlgeriaTimeZone` / `formatAlgeriaDate`. The
round-4 delta adds no vocabulary — it is a test-scan fix, so the domain model is
untouched. No new rule was stated twice.

## Codebase-design (deletion test)

- The round-4 change **deletes** the brittle `PINNED_TIME_ZONE_PATTERN` regex and
  replaces it with `hasUsableTimeZoneOption` + `stripComments` +
  `readTimeZoneValue`. Removing the scanner re-opens the quoted-zone false
  positive and the commented-option false negative, so the seam is real, not
  hypothetical. It is exercised through the exported
  `findUnpinnedDateFormatters`, which is the only public surface.
- `stripComments` and the comment-skipping inside `findMatchingParen` are two
  readers of the same lexical fact. They are not the same function: the matcher
  needs positions in the original source (for `lineNumberAt`), the option check
  needs comment-free content. Unifying them would make the matcher return a
  parallel position map — more machinery than the two call sites justify. Left
  as-is, deliberately; if a third reader appears, the extraction belongs with it.
- The helper `readTimeZoneValue` returns the first token for any unhandled
  nonempty value (e.g. an array literal). That is the intended "not
  `undefined`/`null`/empty" heuristic, and it is documented at the function.

## improve-codebase-architecture

Friction created: none. The scanner now treats a correct
`{ timeZone: "Africa/Algiers" }` as pinned, so the rule no longer blocks valid
production code — before this delta the rule was itself a source of friction
(it failed lint and test on correct calls). No new issue filed.

## Outcome

Nothing actionable found. The round-4 delta is a clean deepening of the existing
seam; no deferral needed.
