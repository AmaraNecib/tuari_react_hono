# Test audit — issue #473 (head `fe9a4fbb`)

- mode: remote
- base SHA: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- reviewed HEAD: `fe9a4fbb61cbce0449427744c29a9c1e4231490b`
- tier: Standard

## Do the tests prove the behaviour, and would they fail on the pre-fix code?

The round-4 delta is the scanner fix. Proof by reverting the scanner to
`f104f403` and running the new samples
(`.scratch/tmp/473/old-scanner.cjs`):

```
quoted     FLAGGED/FAIL (bug reproduced)   # new self-test would fail pre-fix
commented  passed                          # bug: commented option accepted
```

So the two new self-test cases — a nonempty quoted `"Africa/Algiers"` pin and a
commented-out `timeZone` — are red on the pre-fix scanner and green after. That
is the required "fails on pre-fix source" property.

## Coverage of the options vocabulary

`tests/web-hygiene.test.mjs` self-test now pins:

- usable: `timeZone: getAlgeriaTimeZone()`, `timeZone` (shorthand), and
  `timeZone: "Africa/Algeria"` in both double and single quotes;
- unusable: `timeZone: undefined`, `timeZone: ""`, `opts /* timeZone … */`, and
  `{ /* timeZone: getAlgeriaTimeZone() */ }`;
- structure: nested parentheses/strings stay balanced, an unbalanced call is
  flagged, and an unpinned call nested inside a pinned one is still reported.

The production-scan test asserts `files.length > 0`, so an empty filter cannot
pass vacuously.

## Edge cases checked

Empty quoted zone (`""`) rejected; `null`/`undefined` rejected; shorthand
accepted. Comments stripped before the option check, strings outside the option
value skipped by the key scan.

## Verdict

No coverage gap for the fixed behaviour. The heuristic's documented limits
(spread, template interpolation) are out of the scanner's stated scope.
