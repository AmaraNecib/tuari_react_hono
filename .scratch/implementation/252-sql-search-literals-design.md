# #252 SQL search literal escaping tests

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-f32d5d0b-3ea123ade3760c5b`
- Branch: `t3/f32d5d0b`
- Base: `9cdef3d920975d2187111aa09be2db789ad09318`
- Verification: focused-local / CI-final-pending
- Tier: Standard. This adds direct tests for one small shared string helper. Three initial review lenses remain parent-owned.
- Writable committed paths: `apps/api/src/modules/shared/sql-search.test.ts` and this design note.

## Contract and seam

`escapeLikePattern(value)` returns a string suitable for embedding in a SQL `LIKE` pattern when the caller pairs it with `ESCAPE '\'`. The public helper is used by the SQLite company and inventory adapters before parameterized `LIKE` queries. The seam is the exported helper; this batch tests the exact returned string, not HTTP reachability or SQLite matching.

Independent literal expectations cover `%`, `_`, an existing backslash, all three characters in one input, and ordinary Unicode preservation. The expected strings do not reuse the helper's replacement rule. Existing company and inventory integration assertions remain unchanged and continue to cover their adapter behavior.

## Design

No domain terms or adapter interfaces change. The helper remains a small shared module that centralizes escaping for both call sites. No seam moved, so no broader architecture review is warranted.

The matching wisdom lesson, `testing/in-memory-test-doubles-must-mirror-sqlite-s-per-column-semantics`, concerns mismatched in-memory and SQLite query semantics. It does not apply here: this is a direct helper test, and no test double or query semantics changed.

## Proof boundary

A temporary identity mutation made the new suite fail on the four escaping rows while the Unicode assertion passed. The mutation was restored in `finally`; `sql-search.ts` has no final diff and its SHA-256 is unchanged from before the probe. The restored implementation passes all five tests.

Focused lint and strict TypeScript checking cover the new test file. No native SQLite load, full suite, coverage run, build, or whole-module coverage claim is included. Hosted verdict and CI acceptance remain pending for the parent.
