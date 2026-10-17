**Next action:** add `- run: pnpm check:sqlcipher-proof` to the CI `lint` job (`.github/workflows/ci.yml:41`) — the new unit test currently never runs in CI (proof below).

## What ran here

- Unit tests pass: `node --test tests/sqlcipher-encryption-proof.test.mjs` → 8/8 pass.
- `node --check` on the proof → OK; `--help` → OK (pure path, no native toolchain needed).
- `npx turbo run lint --dry=json` → packages = api/contracts/desktop/tsconfig/web. **Root package is not a turbo target.**

## Unverified (hard constraint: no Windows SDK, C: full — the Windows job is the only execution path)

Nothing in the `prove-encryption` job was executed. Specifically unverified by execution:

1. `pnpm --filter @tuari/desktop sidecar:build` succeeding on `windows-latest` and producing the three required assets.
2. `probeSqlcipherBinding` returning a non-empty `cipher_version` against the built binding.
3. The keyed-write probe resolving `better-sqlite3-sqlcipher` from `cwd=runtimeDir` and actually encrypting.
4. The booted runtime honoring `APP_DB_PATH`/`APP_DB_KEY`/`APP_BACKUPS_ROOT`/`API_PORT` and taking a startup backup within 120 s.
5. That the script's default paths (`src-tauri/bin/api-runtime` and `src-tauri/bin/node.exe`) match where #402's staging actually writes them.

---

## Standards axis

Does the change follow this repo's documented rules (`AGENTS.md`, `docs/engineering-workflow.md`, `.agents/wisdom/*`, `tests/workflow-assets.test.mjs`, `tests/repo-hygiene.test.mjs`)?

| # | Grade | Finding | Fix |
|---|---|---|---|
| S1 | **medium** | **The new unit test never runs in CI.** `check:sqlcipher-proof` was added to the root `lint` script (`package.json:21`) but the CI `lint` job does not invoke `pnpm lint` — it runs `pnpm turbo lint` plus an explicit list (`.github/workflows/ci.yml:34-41`). Turbo does not run the root package (`turbo run lint --dry=json` lists only the 5 workspace packages), so `tests/sqlcipher-encryption-proof.test.mjs` executes only on the local pre-push hook. `.scratch/implementation/410-design.md` ("Pure helpers are unit tested in the lint job") is therefore inaccurate. Precedent: `check:e2e-selection` and `check:license-signer` **are** listed in the lint job (`ci.yml:40-41`). | Add `- run: pnpm check:sqlcipher-proof` to the lint job after `ci.yml:41`; correct the design-doc sentence. |
| S2 | **medium** | **The Windows runner is paid for on every PR.** `prove-encryption` runs `pnpm install --frozen-lockfile` unconditionally (`ci.yml:~398`); only the build/prove steps are gated on `needs.detect.outputs.encryption == 'true'`. A web-only PR still spins a `windows-latest` runner and a full install just to echo the "skipped" step. The design doc's risk section frames the job as "path-gated", which the install step is not. | Gate checkout/setup/install with `if: needs.detect.outputs.encryption == 'true'` (the job still always runs, so its required status still reports). |
| S3 | **medium** | **Merged doc contradicts itself.** `docs/editions-and-features.md:232` still lists *"add the build gate so a plaintext release cannot happen by accident (the closed #409 branch has one)"* as future work, while the bullet at `:211` states `build-sidecar.mjs` **already** "fails the desktop build when the SQLCipher native binding is missing (#402)". The gate is in the tree via this stack, so the ordered "shipping later" list is stale. | Reword the `:232` list to say the gate lands in this stack; keep only "add `encrypted_db` to a licence" as remaining. |
| S4 | **low** | `parseArgs` (`apps/desktop/scripts/sqlcipher-encryption-proof.mjs:150-190`): `path.resolve(value)` with no following arg throws `TypeError`; `Number.parseInt("foo")` yields `NaN`, making `waitForHealth`'s `Date.now() < NaN` false → instant failure with a confusing message. Neither is covered by the unit tests. | Guard `value === undefined` and `Number.isFinite` before use; add one test each. |
| S5 | **low** | Merge resolution left bare-filename citations (`factory.ts:23`, `docs/editions-and-features.md:204`) next to full-path ones in the same bullet, and `:208`/`:213` cite the file with no line at all. Readable but inconsistent. | Pick one citation style. |

**Standards verdict:** no repo rule is hard-broken; S1–S3 are the ones worth fixing before merge. The job-integrity rule ("a new CI job must always report its status") **is** satisfied — `prove-encryption` always runs, with a dedicated skipped step (`ci.yml:~419`), matching the other path-gated jobs.

---

## Spec axis

Spec = issue #410 (five numbered requirements + "wire into the desktop/CI path, not only the publish gate" + "fail the job otherwise").

| # | Grade | Finding | Evidence |
|---|---|---|---|
| SP1 | **satisfied** | (1) builds sidecar with real SQLCipher, no `--allow-plaintext`. | `ci.yml:~410` `pnpm --filter @tuari/desktop sidecar:build`; comment states the waiver is not passed. |
| SP2 | **satisfied** | (2) `PRAGMA cipher_version` non-empty against the built binding. | Proof step `[2/5]` calls `probeSqlcipherBinding({ nodeExecPath: nodeExe, runtimeDir })`. |
| SP3 | **satisfied** | (3) keyed open + write + close, asserts file NOT starting `SQLite format 3`. | `WRITE_ROW_PROBE_SOURCE` + `assertEncryptedDatabase` (also rejects truncated/empty files). |
| SP4 | **satisfied** | (4) reopen WITH key, read row back. | `READ_ROWS_PROBE_SOURCE`, asserts exactly one row with the marker. |
| SP5 | **satisfied (path), medium risk** | (5) keyed daily-backup path, backup non-plaintext + key-readable. | Proof boots the real runtime and waits for the snapshot. Confirmed in read-only code: `apps/api/src/index.ts:27-52` takes a **startup** backup (`createStartupBackup`) gated on `/health`, backed by `VACUUM INTO` in `backup.snapshot.ts`; `APP_BACKUPS_ROOT` is honored (`database-env.ts:27`). Path is correct — but only provable on Windows. |
| SP6 | **note** | Spec says wire it into desktop/CI "not only the publish gate". Job is in `ci.yml` (pull_request + workflow_dispatch), not in beta/nightly/release. The wording is satisfied by the CI path; no publish wiring required. | `ci.yml:386-420`. |
| SP7 | **note** | Job fails otherwise: build/prove steps return non-zero and the job reds; `main().catch` sets `process.exitCode = 1`. | script `main()` tail. |

**Spec verdict:** all five requirements are implemented and the job is correctly wired into the CI path with a fail-closed exit. The only real risk is SP5's end-to-end timing (startup backup within the 120 s poll), which cannot be exercised off a Windows runner.

---

## Merge resolution (#402 stack)

- Correct: the merge is cleanly scoped; every file this lane adds is disjoint from the #402 diff. `docs/editions-and-features.md:202-229` reads coherently after resolution — the "publish workflows keep shipping the fallback" sentence is defensible as a statement about the *currently released* artifact (before this stack lands), so it is **not** a contradiction with the new gate.
- The one genuine miss is S3 above (stale "shipping later" list).

No blocker found. Fix S1 before merge; S2/S3 are cheap and belong in the same PR.