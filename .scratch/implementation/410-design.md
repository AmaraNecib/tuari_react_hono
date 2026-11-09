# #410 — CI proves the release artifact can encrypt

- **mode:** focused-local / CI-final-pending
- **ticket:** GitHub #410 (`CI: prove the release artifact can actually encrypt`)
- **worktree:** `D:/worktrees/tuari_react_hono/t3-75232878`
- **stack base:** published #496, `origin/fix/402-encryption-fallback` at
  `1a160b1b3a132af81a103828d8fa4c5835b91f56`; it descends from #504's current
  `develop` at `6ba4146475ad3391b4f9f0007d043907a6cb93fe`.
- **branch:** `fix/encryption-ci-proof-stack`; preserve published #499 `69a26bbe`
  and its completed correction `9ce23ae0` as ancestors, then integrate #504/#496.
- **review tier:** High-assurance — encryption at rest and a release gate.
- **remaining owner gate:** the literal nonempty `PRAGMA cipher_version`. The
  current driver is SQLite3MultipleCiphers and may return an empty result; this
  implementation keeps the required failure. Only the owner can decide whether
  that acceptance format is still mandatory.
- **historical #410 base:** `42609a75` on `fix/402-encryption-fallback`; see
  “Base decision” for the original cherry-pick history.

## Current sequential stack integration

The implementation is being carried on a branch that preserves #499's published
head `69a26bbe` and completed timeout/cleanup correction `9ce23ae0`, then #504's
current-develop source and published #496 (`8ec3d7ed` plus the published
correction `1a160b1b`). The parent will retarget #499 to `develop` after source
publication; this worker does not change the PR.

The #504 event-SHA selector remains the single source for full/affected scopes.
Its fail-closed full scopes require encryption proof too; known scoped changes
set `encryption` from explicit path matching. CI acceptance validates that
output and the `prove-encryption` result, allowing a skipped job only when the
selector says `encryption=false`. The Windows job uses the copied multiple-ciphers
binding for the built-artifact proof, then runs the keyed factory integration
tests against that copied binding. No `TUARI_REQUIRE_SQLCIPHER` sentinel is used;
that test path belonged to the earlier #402 implementation and is absent from
current #504 source.

Both proof probes now select `cipher='sqlcipher'`, set `legacy=4`, then apply the
key, matching the current factory and snapshot worker. The literal nonempty
`PRAGMA cipher_version` requirement remains a hard failure. SQLite3MultipleCiphers
may return `[]` for that query; resolving whether this satisfies #410 is an
owner-only acceptance decision, so local completion cannot claim #410 complete.

## Problem

`#402` makes `build-sidecar.mjs` hard-fail when the SQLCipher addon is missing
and makes the API refuse an encrypted database without a working key. Neither
proves the **released** artifact can encrypt: the addon is a `node-gyp` native
build, `build-sidecar` only ever proved it *loads* and reports a
`PRAGMA cipher_version`, and nothing anywhere proved that a keyed write produces
a file that is not a plaintext SQLite database — or that the daily backup is
encrypted too.

## Decision

1. **The proof runs the built artifact, not a copy of its logic.** The job boots
   `bin/node.exe dist/index.cjs` with `APP_DB_KEY` and lets the real
   `backup.snapshot.ts` worker take the daily backup. A local re-implementation
   of `VACUUM INTO` would be a second, drifting definition of "the daily backup"
   and would not exercise the code that ships.
2. **`PRAGMA cipher_version` is single-sourced with the build.** The proof calls
   `probeSqlcipherBinding` from `sqlcipher-availability.mjs`, so the build and
   the gate cannot disagree about what "the binding works" means.
3. **The plaintext predicate is deliberately NOT shared with the API.** The API
   owns its own `SQLITE_HEADER_MAGIC` check (`backup.service.ts`). A proof that
   reused the predicate it is proving could not catch a bug in that predicate.
   Note the contrast with the duplicated folder layout below: the magic is fixed
   by the SQLite file format, so a second copy cannot drift and sharing it buys
   nothing, while the folder names are a project decision that can change, so
   that copy does carry drift risk and is only mitigated by failing closed.
4. **The job lives in `ci.yml` and is path-gated**, not only in the publish
   gate — a broken native build must fail before release day.
5. **#402's sentinel is armed by the same job.** `backup.encrypted.test.ts`
   skips itself when the native fork is missing, which is right on a workstation
   and wrong in the one job that just built the fork. The job exports
   `TUARI_REQUIRE_SQLCIPHER=1` before running that file, so a missing or
   unloadable binding is a red job rather than three skipped tests.

## Base decision (dependency #402)

#402 is unmerged (PR #409 is closed). Two bases exist:

- `origin/fix/sqlcipher-fallback` — the complete, reviewed #402 implementation
  (27 commits, base `183d2226`). Merging it into this branch is clean except for
  one conflict in `docs/editions-and-features.md`.
- `fix/402-encryption-fallback` (live crew lane `w8E`) — #402 being re-applied
  to current `develop`; no commits yet at the time of writing.

Stacked on the first (see the merge commit on this branch). **Flagged to the
parent:** if the live lane lands its #402 instead, this branch rebases cleanly —
every file this lane adds is disjoint from the #402 diff.

**Resolved.** `fix/402-encryption-fallback` landed and was pushed
(`origin/fix/402-encryption-fallback`), so this branch was rebuilt on it: the
branch was reset to that tip and the six #410 commits were cherry-picked
(`6e446141`, `9e94d1fe`, `8e729c4d`, `ada25cc5`, `69530400`, `8e3a39ef`). The
`fix/sqlcipher-fallback` merge and the ~27 parked `#409`-era commits are gone,
so a PR from this branch no longer resurrects that stack. One conflict per
round, both in `docs/editions-and-features.md`, where #402's newer section 6c
replaced the parked text this lane had edited; the resolution keeps #402's text
and folds in this lane's additions (the `prove-encryption` job, the
`onlyBuiltDependencies` note, the armed sentinel).

## Changed contracts

| Surface | Change |
| --- | --- |
| `apps/desktop/scripts/sqlcipher-encryption-proof.mjs` (new) | CLI: `--runtime`, `--node`, `--health-timeout-ms`, `--backup-timeout-ms`, `--keep`. Exit 0 = proven, 1 = the artifact cannot encrypt or its backup is plaintext. |
| `apps/desktop/scripts/sqlcipher-availability.mjs` | Consumed, not changed: `inspectSqlcipherArtifact`, `probeSqlcipherBinding`. |
| `.github/workflows/ci.yml` | `prove-encryption` uses `windows-2022` when the event-SHA selector sets `encryption=true`; otherwise it reports a selector-proven skip. `CI acceptance` requires its result. The job repoints the API's multiple-ciphers package to the built runtime and runs `factory.encryption.test.ts`. |
| root `package.json` | `check:sqlcipher-proof` runs pure proof tests without a native toolchain and is called by the root lint script and CI lint job. |

## Historical sentinel wiring (not present in current #504 source)

#402 added the file and its sentinel; #410 is what runs it. The step comes
after the runtime proof, and the ordering is load-bearing: `sidecar:build`
builds the fork, the proof proves the built runtime encrypts, and only then does
the API test run against that same binding.

Two mechanisms, both verified locally:

- **`TUARI_REQUIRE_SQLCIPHER=1` is what turns a skip into a failure.** Without
  it the file reports `1 skipped (1)` / `3 skipped (3)` and exits 0 — a green
  tick for an unbuilt fork. With it, on this workstation's unbuilt binding:
  `Tests 1 failed | 2 skipped (3)`, exit 1, message `native SQLCipher binding
  required in this job`.
- **The built package is linked in, not reached through `NODE_PATH`.** The test
  and `factory.ts` resolve `better-sqlite3-sqlcipher` from
  `apps/api/node_modules`, and pnpm links the UNBUILT package there
  (`onlyBuiltDependencies` excludes the fork, so its install script never runs).
  A local probe confirms the precedence: with that link present, a `NODE_PATH`
  pointing at a different copy still resolved the local one; removing the link
  made `NODE_PATH` resolve. A plain unbuilt binding is exactly the
  silent-plaintext case the job exists to catch, so the link is replaced
  (`fs.rmSync` + a `junction` symlink) with the package the proof already
  proved. The host Node can load that addon because `build-sidecar.mjs` copies
  `process.execPath` to `bin/node.exe`, so the node-gyp build and the vitest run
  share one ABI.

The step is inside the existing `prove-encryption` job, so the required-status
contract and the `detect` path filter are untouched.

**Not verified locally:** whether the built addon loads in the vitest run, and
whether the Windows job is green end to end. No Windows SDK here, so no fork can
be built; only the CI job can answer that. Fail-closed: a missing binding is red,
and `vitest run <file>` exits 1 when the file is gone, so a rename cannot make
the step pass silently.

## Tests

- `tests/sqlcipher-encryption-proof.test.mjs` — pure helpers only, runs on
  every PR as an explicit step of the `lint` job (the root `lint` script is not
  what CI invokes; `pnpm turbo lint` never reaches the root package): the magic
  predicate (including that an **empty or truncated** file is not proof of
  encryption), `assertNotPlaintextDatabase`'s rejection paths (missing,
  directory, too small, plaintext) and its 16-byte acceptance boundary, snapshot
  discovery (only a marked `YYYY-MM-DD` folder is a backup, and a broken newest
  folder falls back to the newest complete one), argument parsing (a missing
  value, a non-numeric timeout, an unknown flag, a single-dash typo, a bare
  positional), the required-file list, and a structural guard that both probe
  sources select `cipher='sqlcipher'`, set `legacy=4`, then apply `key` — the
  only place the keyed write can be observed without the native binding.
- The Windows job is the integration proof. It is not unit-testable locally
  (`node-gyp` fails configure on this workstation: *missing any Windows SDK*),
  so the CI run is the only place steps 2–5 execute.

## Risks

- **Windows runner cost.** Path-gated to `apps/desktop/**`, `apps/api/**`,
  `packages/contracts/**`, `infrastructure/**`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, `package.json`, and `ci.yml`.
- **The sidecar boot couples to config.** `BETTER_AUTH_SECRET` must pass the
  entropy gate and `NODE_ENV=development` avoids `BOOTSTRAP_SETUP_KEY`. Both are
  generated/pinned inside the proof, not inherited from the runner. The Rust
  shell never sets `NODE_ENV`, so `development` is the app's own default.
- **The daily backup is asynchronous.** The proof polls the backups root with a
  bounded timeout; a silent no-backup is a red job, not a hang.
- **The backup-folder layout is duplicated, deliberately.** The proof knows
  `YYYY-MM-DD` + `tuari.sqlite` + `snapshot.json`; the owner is
  `backup.policy.ts` / `backup.service.ts`. A layout change makes the proof find
  nothing and go red — fail-closed, which is the right failure for a gate. The
  marker's own `encrypted` field is **not** asserted: `backup.service.ts` writes
  `Boolean(databaseKey)`, an echo of the config rather than a verification.
- **The live-vs-backup check is a schema check, not a data check.** Every table
  the live database has must be present in the backup, but rows are never
  compared, so a schema-complete backup whose tables are all empty still passes.
  Closing that needs a known row written before the backup is taken; the proof
  currently writes no rows into the live database. Accepted limitation, recorded
  rather than implied.

## Verification plan

1. `pnpm check:sqlcipher-proof`, `pnpm check:workflow-assets`,
   `pnpm check:repo-hygiene`, `pnpm check:e2e-selection`, `pnpm lint`,
   `pnpm typecheck`.
2. Windows CI: `pnpm --filter @tuari/desktop sidecar:build` (no
   `--allow-plaintext`) then `node apps/desktop/scripts/sqlcipher-encryption-proof.mjs`.
3. Gate: debate + code-review + test-audit at the code HEAD.

## Review rounds

High-assurance tier, so all three gates plus the design pass ran, three times:

| Round | HEAD | Outcome |
| --- | --- | --- |
| 1 | `8e729c4d` | Request changes: the job would die before the proof (no contracts build), the unit test never ran in CI, the Windows runner was billed on every PR, plus parseArgs and doc findings. |
| 2 | `ada25cc5` | APPROVE from all four. Five LOW items left, all text and one test assertion. |
| 3 | `69530400` | APPROVE from all four. No blocker, no medium, no new finding. |

Evidence: `.scratch/reviews/410/<sha>-{debate,code-review,test-audit,design-pass}.md`;
round 1's files are under `raw/` because they were superseded.

### Local check results at `69530400`

- `pnpm lint` — 0 errors. `pnpm typecheck` — clean.
- `pnpm test:web` — 963/963. `pnpm check:sqlcipher-proof` — 14/14.
- `pnpm test:api` — **waived**, pre-existing: five files
  (`auth/adapters/sqlite-bootstrap.port`, `auth/recovery-key.{service,e2e}`,
  `backup/backup.service`, `update/update-history.service`) fail with hook/test
  **timeouts only**, never an assertion. The same five files fail on the merge
  base (`develop` = `fdb5dda6`) in a clean checkout, with more failures (21 vs
  9) — machine-load flakes, not this branch. See
  `.agents/wisdom/process.md` (the pre-push flake entry).

### Accepted at merge (not fixed, deliberately)

- `docs/editions-and-features.md` still carries unrelated pre-existing citation
  drift (`license.ts:168` at `:42`/`:47`) and a licence-status sentence that
  predates the #399 failure-env change. Both are outside this issue's diff.
- A non-empty but malformed `cipher_version` string still passes step 2, which
  is the price of single-sourcing the probe with the build (decision 2).
- The backup comparison has no unit test; it needs the native binding, so only
  the Windows job can exercise it. Fail-closed.

### Follow-ups proposed to the parent (not filed here)

1. Single-source the backup folder layout between `backup.policy.ts` /
   `backup.service.ts` and the proof — the seam would be `packages/contracts`,
   which changes build order for a workspace package.
2. Assert the CI required-status contract and path-filter completeness in
   `tests/workflow-assets.test.mjs` — a top-level `if:`/`paths:` on a
   path-gated job would silently stop its required check reporting.
3. Keep proof probes aligned with the factory's SQLCipher selection,
   `legacy=4`, and key ordering in `factory.ts` / `backup.snapshot.ts`.
4. `PRAGMA user_version > 0` in the live-database check, to catch a
   half-migrated keyed database that today passes the schema equality.
5. Fix the pre-existing `apps/api` load-flaky timeout files on their own.

### Follow-up hardening on #499 head `69a26bbe`

This lane addresses review findings without changing the encryption protocol,
schema, native binding, or the literal non-empty `PRAGMA cipher_version` gate.
Health requests receive the remaining deadline as an abort signal. Cleanup waits
for the sidecar exit, retries transient Windows lock errors, and reports cleanup
failure distinctly while preserving a prior proof failure. The release-smoke
paragraph now distinguishes its existing binding-load and cipher-version checks
from this job's keyed write, read-back, and backup checks.

The regression test was checked against the unmodified #499 script at
`69a26bbe`: its accepted-but-unanswered health request remained pending after
250 ms despite a 75 ms timeout. The updated proof suite passes 17/17, including
stalled-health cancellation, child-exit ordering, lock retries, and cleanup
failure reporting. The existing 30-second timeout on bundled native probes was
verified in place and was not duplicated. Native SQLCipher runtime verification
remains a Windows CI responsibility.
