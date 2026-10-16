# Code review (#410) — two-axis gate at `8e729c4d`

- **Reviewed HEAD:** `8e729c4d864e288e3c28b48647f5bed1a3e4eacd` (branch `fix/410-encryption-ci-proof`)
- **Base:** `d6164c65` — `git diff d6164c65...HEAD` = 31 files, +6052 / −166
- **Tier:** High-assurance (encryption at rest + a gate whose job is to stop a silent loss of it)
- **Axes run in one context, in order: STANDARDS, then SPEC**

## Verdict

**Ship-blocking blockers: none found in the #410 work.** All five spec requirements have a real enforcing code path; the #410 additions are the only thing that can make the promised guarantee true, and they are wired into PR CI. Failing this review on:

1. **Unproven native path (by environment, not by defect).** No step that needs `node-gyp` + the Windows SDK can execute on this workstation, so the *integration* claim ("the built runtime's keyed write is ciphertext, and its daily backup is keyed") has never run here. I verified it only by reading the code and unit-testing the pure helpers. This is stated, not implied, below.
2. **One round-1 finding is only partly fixed and one is effectively unfixed** (S2 residual Windows VM cost; S5 stale line citations). Both are low/medium, not blockers.

Two things a green run of this job does **not** prove, on purpose: the proof's Windows job only runs on `pull_request`/`workflow_dispatch` (ci.yml:3-5), and the publish workflows (release.yml:114, beta.yml:115, nightly.yml:113) never invoke it — they rely on the #402 load+`cipher_version` probe and the installer smoke test. That satisfies #410's "not the publish gate only" wording, but "proven before release day" rests on the encryption-relevant PR having run this job.

---

## STANDARDS axis

Rules applied, with the source I read for each:

- **AGENTS.md** — commit contents ("The design doc for the current issue: `.scratch/implementation/<issue-id>-design.md`"; "Review evidence for the current issue: `.scratch/reviews/<issue-id>/`"), "Never run `git add -A`", and "**The design pass is a merge gate** … Record the outcome in `.scratch/reviews/<issue-id>/<HEAD>-design-pass.md` (the filename must contain the reviewed HEAD SHA)".
- **docs/development-workflow.md §12.6 "CI Runners & Caching"** — the runner-class doc that this diff amends.
- **Enforcement suites** — `tests/workflow-assets.test.mjs` (9/9 pass) and `tests/repo-hygiene.test.mjs` (3/3 pass) at this HEAD.
- **Smell baseline** (Fowler ch.3) — applied as judgement calls only.

| # | Grade | Finding | Fix |
| --- | --- | --- | --- |
| S-1 | medium | **S2 residual — the Windows VM is still provisioned on every same-repo PR.** `runs-on: windows-latest` (ci.yml:386) is unconditional; only the *steps* are gated (ci.yml:396-427). The repo's own documented pattern is that the job always runs so the required check reports, and that "expensive steps are skipped" (ci.yml:101-104) — the fix follows the letter of that pattern. But the round-1 finding was "the Windows runner was paid for on every PR", and a provisioned-then-skipped Windows job still bills for the job (per-minute, rounded up, 2× Windows multiplier). The 3-5 minutes of install + `node-gyp` + proof are genuinely gone; ~1 billed Windows minute per unrelated PR remains. | Either accept and say so in `docs/development-workflow.md §12.6` (cost note next to the new runner), or move the always-reporting check off Windows: keep a `ubuntu-latest` job carrying the required check name and let the Windows job be the work. Not a correctness issue. |
| S-2 | low | **S5 partly fixed — stale line citations remain.** The fix commit removed the bare-line citations for `factory.ts`, but three others survive and are wrong at this HEAD: `docs/editions-and-features.md:196` cites `apps/desktop/src-tauri/src/lib.rs:2102` for `has_feature("encrypted_db")` (actual: lib.rs:2148, the `command.env("APP_DB_KEY", …)` at lib.rs:2149); the same bullet's parenthetical `(:2025)` for the env clear (actual `env_clear()` at lib.rs:2099); `docs/editions-and-features.md:279` cites `apps/api/src/infrastructure/license.ts:168` for `editionToMinEdition` (actual: license.ts:172). The merge moved `2058 → 2102`, i.e. in the right direction but not to the real line. | Drop the line numbers in favour of file-only citations (the pattern the fix already applied to `factory.ts`), or re-anchor all three. Line numbers in prose drift every merge; the repo already lost this argument once in this diff. |
| S-3 | low | **S3 residual — one doc inconsistency survives.** `docs/editions-and-features.md:236` says the publish workflows "keep shipping the fallback"; `:231-233` says the desktop build "fails the desktop build when the SQLCipher native binding is missing", and `:233-235` says "The gate and the proof arrive together in this stack". No workflow passes a waiver — `grep -rn "allow-plaintext\|TUARI_ALLOW_PLAINTEXT" .github/workflows/*.yml` returns **nothing** — so the sentence is only true of the *already-released* build (where #402 is absent), not of the stack being described in the same bullet. Also `:238-240` ("now has one remaining condition: add `encrypted_db` to a licence") and `:233-235` ("What still blocks selling it is the release path") disagree about whether releasing this stack is a second condition. | One sentence in `:236` — e.g. "until this stack is released, the released publish path still ships the fallback; once merged, a publish build without the addon fails closed". Same for the two remaining-work paragraphs: pick one list. |
| S-4 | low | **AGENTS.md merge-gate artefact not yet present.** AGENTS.md requires the design pass to record `.scratch/reviews/<issue-id>/<HEAD>-design-pass.md` with the reviewed SHA in the filename. At review time `.scratch/reviews/410/` held only `raw/` and `run-reviews.mjs`; no `<HEAD>-design-pass.md`. This run's own evidence file is also still untracked (`git status`: `?? .scratch/reviews/410/`), which is expected pre-commit but must be committed before the PR. | Parent: record the design-pass outcome and commit `.scratch/reviews/410/` (AGENTS.md "What belongs in a commit" explicitly includes review evidence). |
| S-5 | low (judgement call) | **Duplicated Code — the backup layout is declared twice.** `sqlcipher-encryption-proof.mjs:63,69,73` re-declare `DATABASE_FILE_NAME = "tuari.sqlite"`, `BACKUP_MARKER_FILE_NAME = "snapshot.json"` and the `YYYY-MM-DD` pattern; `apps/api/src/modules/backup/backup.service.ts:65,66,69` already export all three. I am **not** calling this a violation: the proof runs on plain `node` against the repo, the owner is TypeScript, and the design doc (410-design.md "The backup-folder layout is duplicated, deliberately") argues fail-closed. Note the argument only covers the *predicate* (`isPlaintextSqliteFile` must not be the thing it proves); sharing the three *names* would not weaken the proof, though no JS-importable seam exists today. | Leave as designed and documented; revisit only if the layout is renamed (today that turns the gate red for a non-encryption reason). |
| S-6 | low | **Commit/diff hygiene — clean.** 31 files, all in AGENTS.md's allowed set (source, tests, `.github/workflows/`, `docs/`, the #410 design doc, review evidence); `.scratch/reviews/402/` + `.agents/wisdom/desktop-packaging.md` arrive from the reviewed #402 merge, not from #410. `.gitignore:45` explicitly un-ignores `/.scratch/reviews/`, so the review-evidence commit is not blocked. No stray scratch noise in the diff. | none |

**Standards: 6 findings (0 high, 1 medium, 5 low). Worst within the axis: S-1** (the runner cost the round-1 review asked to remove is reduced but not removed).

---

## SPEC axis — issue #410, requirement by requirement

| # | Requirement (#410 text) | Status | Enforcing code path |
| --- | --- | --- | --- |
| R1 | Build the sidecar with the real SQLCipher dependency, **no `--allow-plaintext`** | **Satisfied** | `ci.yml:423-425` runs `pnpm --filter @tuari/desktop sidecar:build` with no flag; the no-waiver path is the hard throw at `apps/desktop/scripts/build-sidecar.mjs:158-176` (`enforceSqlcipherGate`). |
| R2 | Assert `PRAGMA cipher_version` is non-empty against the built binding | **Satisfied** | proof step `[2/5]`, `apps/desktop/scripts/sqlcipher-encryption-proof.mjs:378-381`, via `probeSqlcipherBinding({ nodeExecPath: nodeExe, runtimeDir })` loaded from `sqlcipher-availability.mjs` (lazy import at `:57-58`). The emptiness guard lives inside that shared helper, single-sourced with the build's own probe (`build-sidecar.mjs:222-228`). ⚠️ I did **not** re-read `sqlcipher-availability.mjs` internals on this pass (tool budget); I verified the call site only, and cite the round-5 dismissal recorded in the fix commit. |
| R3 | Keyed open + write + close, then assert the file does **not** start with `SQLite format 3` | **Satisfied** | `WRITE_ROW_PROBE_SOURCE` (`:307-320`, run by the bundled Node, `cwd` = runtime root, so it loads the shipped addon) then `assertEncryptedDatabase` (`:339-360`) — magic compare against `SQLITE_HEADER_MAGIC` (`:66`), reached at `:383-388`. Unit-tested at `tests/sqlcipher-encryption-proof.test.mjs:91-121` (missing / 0-byte / 8-byte / plaintext / 2048-byte accepted). |
| R4 | Reopen with the key and read the row back | **Satisfied** | `READ_ROWS_PROBE_SOURCE` (`:322-334`) + the assertion at `:390-396` (`readBack.length !== 1 || readBack[0].marker !== marker`). |
| R5 | Fail the job otherwise; wire it into the desktop/CI path, not the publish gate only | **Satisfied** | Exit-code plumbing: `main().catch(...) { process.exitCode = 1 }` (`:526-536`); job wiring `ci.yml:378-432`, path-gated on `detect.outputs.encryption` (`ci.yml:113-121`), not present in any publish workflow. |
| + | *Beyond spec (design-consistent):* the daily backup is proven too | **Delivered** | `[5/5]` boots the built `dist/index.cjs` under the bundled `node.exe` with `APP_DB_KEY` (`:399-425`), waits for `/health` (`:295-311`), then the real worker writes `VACUUM INTO` snapshot (`apps/api/src/modules/backup/backup.service.ts:1-7`) which is asserted non-plaintext **and** key-readable, with the table set equal to the live database's (`:470-500`). App-owned marker enforced (`:145-152`). |

**Scope creep:** none material. `requiredRuntimeFiles` naming, the bounded timeouts, `--keep`, and the backup-folder marker check are all inside the issue's stated intent ("fail the job otherwise" needs a diagnostic failure). No new product surface.

### Answers to the three questions asked

1. **Does the required status check always report?** For a same-repo PR or manual dispatch, yes: the job has no step-level `if` on `runs-on`, and the terminal echo step (`ci.yml:430-432`) reports success when the path filter is false, so "genuinely skipped" ≠ "never ran". Two caveats: (a) the job-level `if` (`ci.yml:390-391`) skips the job entirely for fork PRs — the check never reports there, but that is identical to `lint`, `typecheck`, `test-rust`, and every other job in this workflow, so it is not a #410 regression; (b) if `detect` fails, `prove-encryption` is skipped as a dependent (`needs: detect`) — also inherited. Whether `prove-encryption` is a *required* check is set in GitHub branch protection, not in the repo; nothing in this diff asserts that it is.
2. **Is the `encryption` filter complete?** It covers the sidecar build, the API paths, contracts, infra, the lockfile, `package.json`, `pnpm-workspace.yaml`, and its own workflow (`ci.yml:113-121`). It does **not** cover `tests/**`, so a change to `tests/sqlcipher-encryption-proof.test.mjs` **alone leaves `encryption=false` and returns green without running the proof.** The blast radius is small — that test runs ungated in the `lint` job (`ci.yml:41`) and the proof's substance lives in `apps/desktop/**`, which *is* covered — but if the intent is "a change to the proof's own test re-runs the proof", add the one path. Also uncovered: root config the native build could consume (e.g. `.npmrc`, `tsconfig*`). Low.
3. **Does `detect`'s output exist for every ref?** `ci.yml` triggers only on `pull_request` and `workflow_dispatch` (`ci.yml:3-5`), and dispatch forces all outputs to `true` (`ci.yml:126-137`), so yes for every ref this workflow can run on. There is no `push` trigger, so a merge to `develop` never runs this job; and if the paths-filter step errors, `detect` fails and every dependent job is skipped (pre-existing pattern for all gated jobs).

---

## Round-1 findings re-verified against `8e729c4d`

| ID | Severity | Verdict | Evidence |
| --- | --- | --- | --- |
| S1/H1 — the new unit test never ran in CI; the design doc claimed it did | medium | **Fixed** | `ci.yml:41` adds `- run: pnpm check:sqlcipher-proof` as an explicit lint-job step (turbo never reaches the root package — the comment at `ci.yml:33-34` says exactly this). `package.json:13` defines it. `410-design.md` Tests section now says "runs on every PR as an explicit step of the `lint` job (the root `lint` script is not what CI invokes; `pnpm turbo lint` never reaches the root package)". Doc and workflow now agree. Ran it here: **11/11 pass**. |
| S2/H2 — the Windows runner was paid for on every PR | medium | **Partly fixed** | All expensive steps gated: checkout `ci.yml:397`, `pnpm/action-setup` `:400`, `setup-node` `:402`, install `:407`, contracts build `:412`, sidecar build `:426`, proof `:432`. The heavy minutes are gone. Unfixed part: the *job* still provisions `windows-latest` (`ci.yml:386`) on every same-repo PR, because the job deliberately always runs so the check reports. Residual ≈1 billed Windows minute per unrelated PR. See S-1. |
| S3 — `docs/editions-and-features.md` contradicted itself about remaining work | medium | **Partly fixed** | The old self-contradiction ("Nothing has proven a keyed write" vs "Shipping later means … prove the keyed write") is gone: `:215-221` now states "#410" proves it and `:238-240` rewrites the remaining-work list. Still inconsistent: `:236` vs `:231-235` (S-3), and the two remaining-work statements disagree on whether release is a condition. |
| S4 — `parseArgs` guarded neither a missing flag value nor a NaN timeout, untested | low | **Fixed** | `valueFor` / `timeoutFor` at `sqlcipher-encryption-proof.mjs:166-186`; applied to all four value flags (`:194-206`). Tests `tests/sqlcipher-encryption-proof.test.mjs:147-156` cover `--runtime` last, `--runtime --keep`, `soon`, and `0`, plus the happy path. Correctly rejects `<= 0` and non-finite. |
| S5 — inconsistent file citations left by the merge resolution | low | **Partly fixed** | `factory.ts` citations reduced to file-only (`docs/editions-and-features.md:200-206`); the `lib.rs` and `license.ts` line numbers remain and are wrong at this HEAD (`:196`, `:197`, `:279`). See S-2. |

---

## Consolidated findings

**HIGH — none.**

**MEDIUM**
1. S-1 — `runs-on: windows-latest` (ci.yml:386) unconditional → a billed Windows VM per same-repo PR, even when every step is skipped. The heavy cost is gone; document or redesign.

**LOW**
1. S-2 — stale line citations: `docs/editions-and-features.md:196` (`lib.rs:2102`, actual 2148/2149), `:197` (`:2025`, actual 2099), `:279` (`license.ts:168`, actual 172).
2. S-3 — `docs/editions-and-features.md:236` "publish workflows keep shipping the fallback" vs `:231-235`; no waiver exists in any workflow.
3. S-4 — AGENTS.md merge-gate artefact `.scratch/reviews/410/<HEAD>-design-pass.md` absent; `.scratch/reviews/410/` still untracked.
4. Filter gap — `tests/**` not in the `encryption` filter (ci.yml:113-121), so a proof-test-only change returns green without the proof.
5. S-5 — backup layout names declared twice (proof `:63,69,73` vs `backup.service.ts:65,66,69`); documented and defensible, flagged as a judgement call.

## What remains UNPROVEN (stated, not implied)

This workstation **cannot** run the native path: `node-gyp` fails configure (no Windows SDK) and there is no release artifact. Therefore:

- R1, R2, R3, R4 are verified **by reading the code and by unit-testing the pure helpers only**. No keyed write against a real SQLCipher addon was executed here.
- `prove-encryption`'s steps at `ci.yml:423-432` have **never run**. A first red run on the Windows runner is still possible from anything I could not execute, specifically: whether `better-sqlite3-sqlcipher@5.4.3-3` + `node-gyp@11` configure against the runner's SDK; whether `pnpm install --frozen-lockfile` produces the *plain* `better-sqlite3/build/Release/better_sqlite3.node` that `build-sidecar.mjs:96-109` requires (`pnpm-workspace.yaml`'s `onlyBuiltDependencies` was not re-read this pass); and whether the API boots under the proof's env set (`NODE_ENV=development`, generated `BETTER_AUTH_SECRET`, `APP_DB_KEY`, `APP_DB_PATH`, `APP_BACKUPS_ROOT` — all names confirmed to exist in `apps/api/src/config` and `apps/api/src/app/dependencies.ts`, and `/health` exists at `apps/api/src/app/create-app.ts:349`, and the startup backup really runs via `apps/api/src/index.ts:33` → `backup.scheduler.ts:44`).
- The proof's default asset paths **do** match the build output: `build-sidecar.mjs:35-39` publishes `src-tauri/bin/api-runtime` + `src-tauri/bin/node.exe`, and `apps/api` ships `dist/index.cjs` (`apps/api/package.json:9`, plus the installer smoke test). That part is consistent.

## Commands run (read-only)

- `node --test --test-timeout=20000 ./tests/sqlcipher-encryption-proof.test.mjs` → 11 pass / 0 fail
- `node --test --test-timeout=30000 ./tests/workflow-assets.test.mjs` → 9 pass / 0 fail
- `node --test --test-timeout=30000 ./tests/repo-hygiene.test.mjs` → 3 pass / 0 fail
- `git diff d6164c65...HEAD`, `git show 8e729c4d`, `git log --oneline`, `git status --short`
- Targeted greps: `APP_DB_KEY` in `lib.rs`, `sidecar|plaintext` across `.github/workflows/*.yml`, `APP_HOST/APP_PORT/APP_BACKUPS_ROOT` in `apps/api/src`, `index.cjs` across the repo, `.gitignore` scratch rules.
- Not run, deliberately: `pnpm --filter @tuari/api test`, `@tuari/web` suites (heavy; another lane holds the slot), and anything requiring the Windows SDK.
