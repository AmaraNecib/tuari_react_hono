# #175 startup upgrade rollback proof

## Pin and scope

- Worktree: `D:/worktrees/tuari_react_hono/t3-51878482-502a4628cb7b8399`
- Base: `origin/develop` at `3885f32579098e97e28dfe6bf40080c851b9c4b4`
- Starting local commit: `09781489ed10508758aebcc3a12c1ea1bf3e0a33`; the worktree was clean. The local commit matched the supplied prior PR head, while the branch was created from the pinned `origin/develop` commit.
- Review tier: High-assurance. The named reachable failure is a failed real startup upgrade after its opening DDL has run, followed by close/reopen and successful retry on the same database file.
- Verification mode: focused-local / CI-final-enforced, as supplied by the parent. CI and protection claims remain parent-owned.
- Writable paths: `apps/api/src/infrastructure/database/opening-schema-upgrade.test.ts` and this note.

## Seam and existing coverage

`ensureFreshExactApplicationSchema` is the supported startup seam, called during normal fresh exact application startup. Its `BEGIN IMMEDIATE` transaction applies opening schema statements, writes the `payroll_opening_v1` marker, applies receipt schema objects, attests the final schema, and commits. Its catch path rolls back.

The existing upgrade test uses `oldDatabase(key)` to create a disposable on-disk #558 plan V1 database. Existing coverage proves successful upgrade/reopen and preflight refusal, but not rollback after DDL has begun. The regression fails the marker write once on the original database connection, after checking that a new opening table exists inside the live transaction. It compares every `sqlite_master` column, markers and selected employee/ledger rows, closes and reopens the same file, retries startup, and checks idempotence.

The test runs against both the plain and keyed fixtures. It uses synthetic employee and ledger data with literal amounts. Its oracle is the before-failure database snapshot and the expected opening table, receipt table and index names. No production module, schema, security rule or recovery policy changes. No seam moved.

## Verification record

Final-source local checks use Node 22.14.0 because the installed SQLite native module targets Node ABI 127. Node 26.13.1 requires ABI 147 and cannot load it.

- Final focused test: `vitest run src/infrastructure/database/opening-schema-upgrade.test.ts -t 'rolls back a failed on-disk startup upgrade' --pool=threads --maxWorkers=1`; 1 file, 2 passed, 10 skipped, native exit 0. Wrapper elapsed 3,324 ms; Vitest reports 1.75 s. Raw output is `.scratch/reviews/175-startup-upgrade-rollback/focused-test-node22-5.stdout.log` and `.stderr.log`; wrapper metadata is in `.meta.txt`.
- Final changed-file ESLint: run from `apps/api` to load its `eslint.config.mjs`; native exit 0, wrapper elapsed 2,935 ms. Output is `.scratch/reviews/175-startup-upgrade-rollback/eslint-api-cwd.stdout.log`; wrapper metadata is in `.meta.txt`. An earlier root-directory invocation failed to find the API config. Its wrapper incorrectly reported exit 0. Preserve that failed output at `.scratch/reviews/175-startup-upgrade-rollback/eslint-final.stderr.log`; it is not a pass.
- Final API typecheck: `tsc --noEmit -p apps/api/tsconfig.json`; native exit 0, wrapper elapsed 25,631 ms. Raw output is `.scratch/reviews/175-startup-upgrade-rollback/api-typecheck-final.stdout.log` and `.stderr.log`; wrapper metadata is in `.meta.txt`.
- `git diff --check`: exit 0.
- Targeted design-note scan for unslop patterns: no matches.
- The focused review directory uses 296 KB. The `tuari-545-upgrade-*` fixtures created since 12:20 total 6,258,688 bytes across eight directories. D: had 9.03 GB free at measurement.

The first test invocation used Node 26 and malformed `pnpm exec` arguments. It unexpectedly ran all 156 API test files for 75.16 seconds and failed because the SQLite addon was built for ABI 127; 59 tests failed and 43 passed. This was an accidental broad run, not evidence about the change. No retry of the broad suite was made. A later invocation with an unsupported Vitest option ran no tests. The next focused invocation skipped all 12 cases because its anchored name pattern did not match the parent suite name. The first correctly selected run executed both new cases and found an assertion comparing four selected catalog fields with `SELECT *`; the test now compares the full catalog consistently. These attempts and their raw logs remain under `.scratch/reviews/175-startup-upgrade-rollback/`.

The assignment prohibited child work, so no independent review sessions were started. The issue manager owns the three required initial reviews at the integrated frozen head, plus CI acceptance and publication decisions. No full suite, benchmark, build, browser test, dependency install or package rebuild is in scope.

## Governance integration

Integrated governance commit `d871504050683c3a859e1f453fc9d0d90f41cecb` by a normal non-rewriting merge after the startup proof was committed and the tree was clean. Read `AGENTS.md`, `docs/engineering-workflow.md`, `.agents/skills/crew-dispatch/SKILL.md` and `.agents/skills/writing-for-agents/delegation-template.md` from that revision. Applied its role contract: this lane is the Luna worker; the calling issue-manager thread owns issue acceptance and the CEO/queue owner owns cross-lane decisions. The worker hands off the commit and proof, without publication. No review or source file changed during this governance integration except this note's evidence correction; the regression-test blob remains `c1b312140ac94401d71c444eb7e36633528f2635`.

## Wisdom

Applied: `testing/deterministic-concurrency-tests-for-single-connection-ports.md`, specifically its advice to inject a deterministic failure rather than depend on timing. No additional wisdom lesson is warranted by this one proof.
