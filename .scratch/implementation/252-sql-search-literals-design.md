# #252 SQL search literal escaping tests

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-f32d5d0b-3ea123ade3760c5b`
- Branch: `t3/f32d5d0b`
- Initial base: `9cdef3d920975d2187111aa09be2db789ad09318`
- Reconciled base for the measured named-module cohort: `424299b60c4faf60b5ddf0c257b2a43aa5cb9154`
- Verification: focused-local / CI-final-pending
- Tier: Standard. This adds direct tests for one small shared string helper. Three initial review lenses remain parent-owned.
- Committed paths: `apps/api/src/modules/shared/sql-search.test.ts`, `apps/api/src/modules/shared/cursor.test.ts`, `apps/api/src/modules/version.test.ts` and this design note. The cursor additions close measured runtime guard gaps in the same named-module acceptance cohort, not a separate unrelated PR.

## Contract and seam

`escapeLikePattern(value)` returns a string suitable for embedding in a SQL `LIKE` pattern when the caller pairs it with `ESCAPE '\'`. The public helper is used by the SQLite company and inventory adapters before parameterized `LIKE` queries. The seam is the exported helper; this batch tests the exact returned string, not HTTP reachability or SQLite matching.

Independent literal expectations cover `%`, `_`, an existing backslash, all three characters in one input, repeated occurrences of every special character, and ordinary Unicode preservation. The expected strings do not reuse the helper's replacement rule. Existing company and inventory integration assertions remain unchanged and continue to cover their adapter behavior.

## Design

No domain terms or adapter interfaces change. The helper remains a small shared module that centralizes escaping for both call sites. No seam moved, so no broader architecture review is warranted.

The matching wisdom lesson, `testing/in-memory-test-doubles-must-mirror-sqlite-s-per-column-semantics`, concerns mismatched in-memory and SQLite query semantics. It does not apply here: this is a direct helper test, and no test double or query semantics changed.

## Proof boundary

A temporary identity mutation made the new suite fail on the four escaping rows while the Unicode assertion passed. The mutation was restored in `finally`; `sql-search.ts` has no final diff and its SHA-256 is unchanged from before the probe. The initial restored implementation passed all five tests. Test-audit found that escaping only the first occurrence of each character could survive those inputs. The bounded correction adds one repeated-character row and checks it against a temporary non-global-regex mutation. Prior proof remains retained; corrected-head proof is recorded separately.

Focused lint and strict TypeScript checking cover the changed helper tests. The initial SQL proof loaded no native SQLite or generated contracts. Hosted verdict and CI acceptance remain separate gates.

## Measured named-module completion slice

A parent diagnostic on the existing four named update/session/shared test files measured 45 passing tests but failed unchanged current coverage thresholds. Session, update metadata and update-history services measured 100% in all four metrics. Cursor had exactly two uncovered guard branches at lines 97 and 129; SQL-search was not exercised in that baseline tree because these new direct tests were still isolated here. Exact measured evidence stays local under the prerequisite handoff, not in committed review reports.

After the accepted SQL repeated-character correction, the same lane reconciled with the already-merged #648 base. It adds public decodeCursor rejection cases for decoded null and primitive JSON, and false predicate cases for non-object unknown inputs. Expectations are runtime shape rejection and literal false, not private-function assertions. Temporary removal of each guard supplies discrimination; production source is restored exactly.

The first combined measurement passed 58 tests and fully covered the five named update/session/shared source files. Including their directly used ordinary version utility exposed its package-metadata fallback at line 25, leaving statements 98.43% and lines 98.18%, below unchanged current floors. New public version tests cover empty-version metadata and an unreadable packaged metadata file, each expecting literal `0.0.0`. A wrong fallback mutation fails both, with exact production restoration before green. Module and environment mocks are reset after each test; no real package file is changed.

The refreshed bounded cohort passes all 60 tests across six test files and fully covers six source files: 64/64 statements, 56/56 branches, 18/18 functions and 55/55 lines. Runtime diagnostic includes select update/session/shared and version.ts; committed config and existing 99/98/99/99 floors remain untouched. Exact source/config fingerprints and raw outputs stay in ignored evidence. This establishes this cohort, not full API enforcement or whole #252 completion. Remaining module classification and committed inclusion still require their authorized disposition. No full API suite or repository build was run.

The first pagination-guard mutation survived plain primitive inputs because property lookup still yielded undefined. A callable unknown value with a limit property now discriminates that guard precisely. The retained successful primitive cases are contract examples, not falsely claimed isolated negative proof. The decoded-null guard probe fails its intended shape-error assertion. Necessary local SQLite binding setup had a failed native-exit marker wrapper; that failure remains recorded and is not relabeled successful. Actual update-history execution in the passing cohort independently proves usable local prerequisites.
