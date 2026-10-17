## Verdict first

**Request changes — 2 high findings, both one-liners.** The harness design is sound, but as wired, the new job will (1) very likely die *before* the proof steps and (2) never run the harness's own unit tests in CI. Net: steps 2–5 of #410 are still unproven, and unproven in CI too.

1. Add `- run: pnpm --filter @tuari/contracts build` before the `sidecar:build` step at `.github/workflows/ci.yml:409`.
2. Add `- run: pnpm check:sqlcipher-proof` to the lint job (`ci.yml`, alongside `check:e2e-selection` at line 40).

---

# Critic findings

**H1 — score 9 — the job fails before the proof: `@tuari/contracts` is never built.** `.github/workflows/ci.yml:409` runs `pnpm --filter @tuari/desktop sidecar:build`, which shells out to `pnpm --filter @tuari/api build` (`apps/desktop/scripts/build-sidecar.mjs:185`). The API build is tsup with `noExternal: [/^(?!@prisma\/client$|better-sqlite3$|better-sqlite3-sqlcipher$|integer$).+/]` and `dts: true` (`apps/api/tsup.config.ts`), so `@tuari/contracts` must be resolvable and bundled. Its entry points are `./dist/index.js` / `./dist/index.d.ts` (`packages/contracts/package.json`), and `packages/contracts/dist` is gitignored and untracked (`git check-ignore` → `.gitignore:5 **/dist/`; `git ls-files packages/contracts/dist` → empty). Every other job that builds anything downstream builds it first: `ci.yml:57`, `:238`, `:264`, `:378`, and `beta.yml:61`, `nightly.yml:59`, `release.yml:80`. This job is the only one that calls `sidecar:build` and the only build path without it. **Fix:** insert `- run: pnpm --filter @tuari/contracts build` (or `pnpm --filter @tuari/api... build`, ellipsis for topology). Cost ~2 min of reviewer time, ~40s of CI.

**H2 — score 8 — the harness's unit tests never run in CI.** The commit message claims "Pure helpers are unit tested in the lint job," but `check:sqlcipher-proof` was added to the root `lint` chain (`package.json:13`) and the lint job runs `pnpm turbo lint` plus a hand-picked list: `check:unslop`, `test:prose`, `test:ci-scripts`, `check:e2e-selection`, `check:license-signer` (`ci.yml:33–41`) — `check:sqlcipher-proof` is absent, and it was not added to the `test` script either (`package.json:19`). No job I read runs the root `lint`/`test` script. Also `tests/sqlcipher-encryption-proof.test.mjs` is not in the `encryption` path filter (`ci.yml:114–122`), so a change to the test alone can't pull anything in. **Fix:** one step in the lint job. *Caveat:* I read the step lists of lint/typecheck/detect/test-api/test-web/test-e2e/build/prove-encryption; I did not read `test-rust` (`ci.yml:144–218`), and I did not grep every workflow for `pnpm lint`. One `grep -rn "pnpm lint" .github/workflows/` confirms or kills this.

**M1 — score 7 — the whole artifact claim is still unproven, and the CI job is its only executor.** Nothing in this lane runs steps 2–5 anywhere I can observe. The local constraint (no Windows SDK, `node-gyp` fails) means the four real claims rest entirely on a job that, per H1, likely fails at build time. **Fix:** after H1/H2, get one green `prove-encryption` run on a scratch PR and paste the `cipher_version` line into the PR comment; until then, do not describe #410 as "proven."

**M2 — score 6 — unverified: can `node-gyp rebuild` fetch SQLCipher's source under pnpm's blocked build scripts?** `pnpm-workspace.yaml:4–6` approves only `better-sqlite3` and `prisma` — the fork is deliberately excluded (documented in `docs/editions-and-features.md`), and `build-sidecar.mjs:90–110` drives `node-gyp rebuild` directly. If the fork's sources/amalgamation are fetched by an *install* script rather than by a gyp `download` action at configure time, the CI build fails for a third reason. I could not inspect the fork's `binding.gyp` within budget. **Check:** `node apps/desktop/scripts/build-sidecar.mjs` on a Windows runner, or read `node_modules/better-sqlite3-sqlcipher/binding.gyp` for `download` / `action` targets.

**M3 — score 5 — step 5 accepts a looser notion of "backup" than the service.** `sqlcipher-encryption-proof.mjs:132–146` treats any `YYYY-MM-DD` folder containing `tuari.sqlite` as the daily backup, but the service defines a snapshot folder as one carrying `snapshot.json` (`apps/api/src/modules/backup/backup.service.ts:21–48`, `BACKUP_MARKER_FILE_NAME`). A dated folder the app never wrote could satisfy the gate. Today the workspace is a fresh `mkdtempSync` (`:338`), so this cannot false-pass — it's a weakening, not a bug. The same predicable drift exists in the duplicated literal at `:70` versus `backup.policy.ts`'s `BACKUP_DIRECTORY_NAME_PATTERN`; if the layout gains a suffix the proof hangs for 120s instead of saying why. **Fix:** also require `snapshot.json`, and assert it names `app: "tuari"`, format 1.

**L1 — score 3 — `BETTER_AUTH_SECRET` / `NODE_ENV=development` coupling at `:410, :417`.** The boot relies on `NODE_ENV=development` to avoid the production-only `BOOTSTRAP_SETUP_KEY` requirement (`apps/api/src/config/index.ts:263`) while supplying a 32-byte hex secret to satisfy the entropy check. If the sidecar entry pins `NODE_ENV` or dev mode loads a cwd-relative config file, step 5 fails confusingly. Unproven; cheap to prove by running the same boot on any machine with a prebuilt runtime.

**L2 — score 2 — `parseArgs` yields `NaN` timeouts.** `sqlcipher-encryption-proof.mjs:173–180`: a flag with no value (`--health-timeout-ms` last) sets `NaN`, and `Date.now() + NaN` makes `waitForHealth` fail instantly with `within NaNms`. One guard: `Number.isFinite` or throw `--health-timeout-ms needs a number`.

**L3 — score 2 — a red Windows run leaves no evidence.** The `finally` at `:459–463` deletes the workspace unless `--keep`, and CI cannot pass it. **Fix (defer):** upload the transcript/workspace as an artifact on failure.

**Merge resolution (#402 / 666104c6) — score 3, docs only.** The single conflict hunk in `docs/editions-and-features.md` resolves coherently: develop's "parked" framing is kept, the gate is described, and a new bullet states #410 proves the keyed write. Two drifts to fix in that text: it attributes the gate to "preserved from the closed #409 branch" while the merged code carrying it is #402's `build-sidecar.mjs`/`sqlcipher-availability.mjs`; and it reintroduces a bare `(factory.ts:23)` line reference in a paragraph whose develop version had just dropped line numbers. No code interaction between the merge and this lane's harness: the harness *depends* on `sqlcipher-availability.mjs` (imported lazily at `:335`), which arrives only with the merge — that import path is correct post-merge (`apps/desktop/scripts/sqlcipher-availability.mjs` exists, exports `inspectSqlcipherArtifact` and `probeSqlcipherBinding` with the `{nodeExecPath, runtimeDir}` shape the harness passes).

**Merge resolution — no blocker found.** I inspected the only conflicted hunk (`git show 666104c6 -- docs/editions-and-features.md`) and the file list; I did not re-review #402's 25 files.

# Defender's case

**D1 — (9) Single-sourcing beats a copy.** Step 2 calls `probeSqlcipherBinding` from `sqlcipher-availability.mjs` (`sqlcipher-encryption-proof.mjs:379`) instead of re-implementing the probe, so the build gate and the proof can never disagree about what "SQLCipher is present" means. That is the correct seam.

**D2 — (9) The plaintext predicate is independently derived, deliberately.** `SQLITE_HEADER_MAGIC` at `:67` is a private literal, not imported from `apps/api/src/infrastructure/database/factory.ts`'s `SQLITE_HEADER`. A proof that shares the predicate it proves cannot catch a bug in it. Exactly right.

**D3 — (8) The short-file case is handled, which is the classic false pass.** `:103–106` returns `false` for a file shorter than the magic, and `:321–323` rejects a file smaller than 16 bytes before that. `0 === "not plaintext"` cannot be read as proof of encryption. This is the bug the naive version of this script ships with.

**D4 — (8) Step 5 boots the artifact rather than re-implementing `VACUUM INTO`.** `:404–456` spawns the built `dist/index.cjs` and waits for the real backup worker's output. A copy of `VACUUM INTO` in the harness would be a second, drifting definition of "the daily backup" and would prove nothing about the shipped path. The timeout budget (120s, `:77`) is generous against the scheduler's 30s fallback (`backup.scheduler.ts`).

**D5 — (8) Step 5's two assertions close the one hole that matters.** It checks the backup is non-plaintext *and* key-readable (`:445–455`). If the backup worker opened a second connection without the key, the first check fires; if it wrote an unreadable blob, the second fires. That pair is what actually makes "the daily backup is encrypted" a claim rather than a hope.

**D6 — (7) The error-message refinement (9e94d1fe) fixes a real misdirection.** `:356–363` now keys the sidecar-build hint on `SQLCIPHER_PACKAGE_DIR` only, so a missing `node.exe` is reported as a missing interpreter. The test at `tests/sqlcipher-encryption-proof.test.mjs:82–94` pins the asset list *and* the wording — the regression a reviewer would otherwise re-hit.

**D7 — (7) Path gating is economical and deliberate.** `encryption` (`ci.yml:114–122`) covers the sidecar build, the API DB/backup paths, the lockfile and the workflow itself, and `workflow_dispatch` forces it on (`:135`). A Windows native build on every PR would be worse.

**D8 — (6) `--allow-plaintext` is not passed (`ci.yml:407`), so the gate is live in this job.** The waiver exists for `typecheck` (`apps/desktop/package.json:14`) and cannot leak in here.

**D9 — (5) Leaving the fork out of `onlyBuiltDependencies` is a documented, defensible choice**: it keeps a plain `pnpm install` from paying for a native build, with the sidecar build driving `node-gyp` itself. (It is only a *risk* — M2 — not a defect.)

# Synthesis

| # | Severity | In scope | Verdict |
|---|---|---|---|
| H1 contracts build missing | 9 | yes | **Fix now** — else the job is red for an unrelated reason |
| H2 tests not wired into CI | 8 | yes | **Fix now** — one line; the commit message currently overstates coverage |
| M1 artifact claims unproven | 7 | yes | Fix by evidence, not code: one green run, paste output |
| M2 node-gyp source fetch | 6 | yes | Verify by reading the fork's `binding.gyp`; fix only if it fails |
| M3 loose snapshot detection | 5 | yes | Cheap → require `snapshot.json`; note the pattern duplication |
| L1 boot env coupling | 3 | yes | Defer until the first real run tells us |
| L2 NaN timeouts | 2 | yes | Cheap → guard |
| L3 no CI evidence on failure | 2 | yes | Defer, file an issue |
| Merge docs drift (#409 vs #402, line refs) | 3 | yes | Cheap → fix the two phrases |

**Per the debate skill I would classify these and commit the "Fix it" set; the task is review-only, so nothing was edited and no evidence file was written to `.scratch/reviews/410/…`. All "Fix it" items are returned as required follow-ups.**

**What is good and verified:** the proof is a real proof, not a smoke test — non-plaintext predicate independently derived, short-file false pass closed, keyed round-trip on a file it wrote itself, and the *shipped* runtime booted to exercise the genuine `VACUUM INTO` backup path. The merge resolution is a genuine 3-way resolution of a single docs hunk and does not damage #402's code; the harness's dependency on `sqlcipher-availability.mjs` is satisfied only by that merge, and the wiring matches the exports.

**What is unproven (state this in the PR, do not claim otherwise):**
- `PRAGMA cipher_version` non-empty against the built binding (step 2).
- The keyed write producing a non-plaintext file and the keyed re-read (steps 3–4).
- The shipped runtime booting with `APP_DB_KEY` and writing an encrypted, key-readable daily backup (step 5) — including the unverified assumptions that no license/edition gate drops the key (I found `encrypted_db` only in error strings and feature maps in `apps/api/src`, no gate in the DB path), that `/health` triggers the startup backup (`backup.scheduler.ts` `onHealthServed`), and that `NODE_ENV=development` avoids the production-only `BOOTSTRAP_SETUP_KEY`.
- That the CI job reaches the proof at all (H1).
- That `node-gyp` can rebuild the fork under the current `onlyBuiltDependencies` (M2).

**Next action (under 2 minutes): open `.github/workflows/ci.yml`, insert `- run: pnpm --filter @tuari/contracts build` above line 409 and `- run: pnpm check:sqlcipher-proof` below line 40.**