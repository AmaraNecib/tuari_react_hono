## Negative contract-surface tests: use `in`, not `as Record<string, unknown>` (🟡 Minor)

On #239 the test-audit quality reviewer caught a false-positive trap in the
"procedures are NOT advertised" regression test: `(appContract as Record<string,
unknown>).recurringPatternsList`. The cast disables key-name checking, so a
misspelled key (e.g. `recurringPatternsGetAll`) silently returns `undefined` and
the test passes on the very invariant it exists to guard. The cast-free form is
`expect("recurringPatternsList" in appContract).toBe(false)`. Key checked as a
literal string, zero type escape.

**Always**: for "this key must not exist on an object" assertions, prefer the
`in` operator over a `Record<string, unknown>` cast; a broad cast turns the
negative test into a false-positive machine on typos.

