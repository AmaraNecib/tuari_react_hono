# #410 — CI proves the release artifact can encrypt

- **mode:** remote
- **ticket:** GitHub #410 (`CI: prove the release artifact can actually encrypt`)
- **target ref:** `origin/develop`
- **base SHA:** `d6164c65` (worktree HEAD at lane start; `origin/develop` was `ec369a30`, one commit ahead)
- **branch:** `fix/410-encryption-ci-proof`
- **review tier:** High-assurance — encryption at rest, and a gate whose whole
  purpose is to stop a silent loss of that guarantee.
- **dependency:** #402 (the fail-loud sidecar build + the real SQLCipher probe).
  Not merged. See "Base decision" below.

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

## Changed contracts

| Surface | Change |
| --- | --- |
| `apps/desktop/scripts/sqlcipher-encryption-proof.mjs` (new) | CLI: `--runtime`, `--node`, `--health-timeout-ms`, `--backup-timeout-ms`, `--keep`. Exit 0 = proven, 1 = the artifact cannot encrypt or its backup is plaintext. |
| `apps/desktop/scripts/sqlcipher-availability.mjs` | Consumed, not changed: `inspectSqlcipherArtifact`, `probeSqlcipherBinding`. |
| `.github/workflows/ci.yml` | New `prove-encryption` job (`windows-latest`), new `detect` output `encryption`, new path filter. |
| root `package.json` | New `check:sqlcipher-proof`, wired into `lint` (pure-logic tests, no native toolchain). |

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
  sources still apply `key` and `cipher_compatibility` — the only place the
  keyed write can be observed without the native binding.
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
   `pnpm check:repo-hygiene`, `pnpm check:e2e-selection`, `pnpm lint`.
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
3. Single-source or cross-reference the `cipher_compatibility = 4` the proof's
   probe sources mirror from `factory.ts` / `backup.snapshot.ts`.
4. `PRAGMA user_version > 0` in the live-database check, to catch a
   half-migrated keyed database that today passes the schema equality.
5. Fix the pre-existing `apps/api` load-flaky timeout files on their own.
