# Code review (#410) — two-axis gate, round 2 @ `ada25cc5`

- **Reviewed HEAD:** `ada25cc548fd06b32a89a34841ac57c870cedd39`
- **Base:** `d6164c65` — whole change = 32 files, +6168 / −169
- **Round-1 HEAD:** `8e729c4d`; fix commit under scrutiny: `8e729c4d..ada25cc5` (6 files, +160 / −47)
- **Tier:** High-assurance (encryption at rest + a gate whose purpose is to stop a silent loss of it)
- **Axes:** STANDARDS, then SPEC, in one context (per `.agents/skills/code-review/SKILL.md`)
- **Spec source:** GitHub #410; `.scratch/implementation/410-design.md`

## Verdict

**APPROVE — no blocker, no medium; all 13 round-1 must-answer fixes are correct and complete, three low doc/evidence leftovers.**

## Round-1 findings, re-verified against `ada25cc5`

| # | Round-1 item | Verdict | Evidence at HEAD |
| --- | --- | --- | --- |
| 1 | S-1 unconditional `runs-on: windows-latest` | **fixed** | `ci.yml:400` `runs-on: ${{ needs.detect.outputs.encryption == 'true' && 'windows-latest' \|\| 'ubuntu-latest' }}`; every heavy step still gated `:406-437`; the skip echo is the only Ubuntu-path step (`:440-441`). `actionlint .github/workflows/ci.yml` → exit 0. See the dedicated section below. |
| 2 | S-2 stale citations (`lib.rs:2102`, `:2025`, `license.ts:168`) | **fixed** (for the three named) | `docs/editions-and-features.md:195-197` and `:279` now file-only, matching the `factory.ts` pattern. Residual: same doc still cites `lib.rs:2052` at `:93` and `:109`, which at HEAD sits inside `spawn_api_process` (declared `lib.rs:2049`) — the `LicenseManager::initialize` call is at `lib.rs:2141`. Pre-existing, not in round 1's list → LOW 3 below. |
| 3 | S-3 "publish workflows keep shipping the fallback" | **fixed** | `docs/editions-and-features.md:227-231` now reads "What still blocks selling it is not the code … once that stack is released, no publish build can package a plaintext artifact by accident", and `:236-238` keeps a single remaining condition (add `encrypted_db` to a licence). The two lists no longer disagree. |
| 4 | S-4 design-pass artefact missing / evidence untracked | **partly fixed** | Artefact exists: `.scratch/reviews/410/raw/8e729c4d864e288e3c28b48647f5bed1a3e4eacd-{code-review,debate,test-audit,design-pass}.md`. But "staged for commit" is not true: `git status --short` → `?? .scratch/reviews/410/`; `git diff --cached --name-only` → empty; `git show --name-only ada25cc5` contains no `.scratch/reviews/**`. LOW 1 below (parent action, not code). |
| 5 | Filter gap: `tests/**` absent from `encryption` | **fixed** | `ci.yml:122` `- 'tests/sqlcipher-encryption-proof.test.mjs'`, with the reason at `:120-121`. Scoped to the one file the claim made, not `tests/**` — deliberate and fine. |
| 6 | test-audit MEDIUM-1 (deleted key pragma failed no unit test) | **fixed** | `WRITE_ROW_PROBE_SOURCE` / `READ_ROWS_PROBE_SOURCE` exported (`proof.mjs:254`, `:268`); `tests/sqlcipher-encryption-proof.test.mjs:152-166` asserts both sources match `/db\.pragma\("key = /` and `/cipher_compatibility = 4/`, plus `INSERT INTO proof` and `TUARI_PROOF_SQL`. Deleting the key pragma now fails `check:sqlcipher-proof` on Ubuntu. Residual LOW 4. |
| 7 | MEDIUM-2 / N3 / E6 schema-only backup check | **fixed as promised** | Comment at `proof.mjs:517-519` says "This is a schema check, not a data check … cannot see a backup whose tables exist but are empty"; design doc `:101-105` records the accepted limitation and why. Claim was "document it"; documented accurately at both sites. |
| 8 | MEDIUM-3 / E1 untested newest-invalid fallback | **fixed** | `tests/sqlcipher-encryption-proof.test.mjs:93-110` pins "newest **complete** backup" as the contract (2026-03-02 marker-less → returns 2026-03-01); design doc `:76-78` records it. |
| 9 | LOW-1 / E2 raw EISDIR on a mis-resolved path | **fixed** | `proof.mjs:369-377` stats first and throws `found a directory` / `a special file`; asserted at `tests/…:117-122`. The label now survives for both the directory and the labelled-missing cases. |
| 10 | LOW-2 / E4 `parseArgs` silent typo/positional | **fixed** | `proof.mjs:218-224`: the `default:` branch throws unconditionally, so `-runtime x` and a bare positional are errors; asserted at `tests/…:194-198`. |
| 11 | LOW-3 / E3 16-byte boundary | **fixed** | `tests/…:138-148`: 16 non-magic bytes accepted and returns exactly `SQLITE_HEADER_MAGIC.length`. |
| 12 | debate N1 wrong citation | **fixed** — same edit as item 2; the `:2102` text is gone from the file. |
| 13 | debate N2 spurious-red on live-vs-backup equality | **fixed, correctly** | `proof.mjs:524-531` is now a subset test (`liveTables.filter(t => !snapshotTables.includes(t))`). Ordering check: `liveTables` is read at `:497`, the snapshot lands at `:505-509`, so any live table predates the snapshot and must be present in it — the pre-snapshot read can no longer produce a false red. Residual wording nit LOW 5. |
| 14 | debate N4 "pinned devDependency" | **fixed** | `docs/editions-and-features.md:218` — "its own devDependency (the version is pinned by the lockfile)". |
| 15 | design-pass F1 rename | **fixed, complete** | `grep -rn assertEncryptedDatabase` across `*.mjs`/`*.ts`/`*.md`/`*.yml` (round-1 evidence excluded) → zero hits. Called at `proof.mjs:449`, `:488`, `:512`. |
| 16 | design-pass F2 owner-side pointer | **fixed** | `apps/api/src/modules/backup/backup.policy.ts:33-38` names the proof file, `findSnapshotDatabase`, and "Change both sides". |
| 17 | design-pass F3 rationale for opposite duplication answers | **fixed** | `410-design.md:36-40` ("the magic is fixed by the SQLite file format … the folder names are a project decision that can change") and the same contrast in `proof.mjs:134-139`. |
| 18 | FU1/FU2/FU3 + `user_version` deferred | **dismissed with reason — deferral is sound** | FU1 needs a new `packages/contracts` seam and a lockfile-visible build order; FU2 is a new `workflow-assets` assertion; FU3 mirrors an encryption parameter that agrees today (`factory.ts` / `backup.snapshot.ts`). None belongs in an encryption-gate PR. Not re-raised. |

---

## Conditional `runs-on` — the specific check requested

`ci.yml:400`:

```yaml
runs-on: ${{ needs.detect.outputs.encryption == 'true' && 'windows-latest' || 'ubuntu-latest' }}
needs: detect
```

- **Syntax:** valid. The `&&`/`||` pair over non-empty string literals is standard expression short-circuit; the scalar is a YAML plain scalar that starts with `$` and contains no `: `, so it is not re-parsed as a mapping. `actionlint .github/workflows/ci.yml` exits **0** locally against the real file.
- **`needs` context:** resolvable there. `jobs.<job_id>.runs-on` is in GitHub's documented context-availability list for `needs` (the same class as `strategy`/`matrix`/`vars`, all standard dynamic-runner usage), and the job declares `needs: detect`. Key order inside the mapping (`runs-on` above `needs`) is irrelevant in YAML.
- **Failure mode if it were wrong:** a workflow/expression error on the first run — loud, not silent. No path here can turn the check green while doing nothing.
- **Terminal step still correct on Ubuntu:** yes. `ci.yml:440-441` (`if: … != 'true'` → `echo`) is bash-safe, is the only step that runs when the filter is false, and the job `name:` at `:394` is unchanged, so branch protection still matches the required check. The Ubuntu path runs no setup/install work (all gated at `:406-437`), so the cost claim in the new comment holds.
- **Semantics preserved:** gate on `encryption == 'true'` → Windows + full proof; gate false → Ubuntu + skipped echo; `workflow_dispatch` forces `encryption=true` (`ci.yml:130-136`); fork PRs still skip the job wholesale via the job-level `if` (`:395`), unchanged from every other job.

Residual (LOW 2): the two comments that describe this job as unconditionally non-Ubuntu are now stale — `ci.yml:386` ("The only non-Ubuntu job in this workflow") and `docs/development-workflow.md:377` ("every job uses `ubuntu-latest` except `prove-encryption`, which uses `windows-latest`"). The fix commit updated the inner comment (`:396-399`) but not those two.

---

## STANDARDS axis

Rules read: `AGENTS.md` ("What belongs in a commit", "Never run `git add -A`", the design-pass merge gate), `docs/development-workflow.md §12.6 CI Runners & Caching`, `tests/workflow-assets.test.mjs`, `tests/repo-hygiene.test.mjs`, and the Fowler smell baseline as judgement calls only.

| # | Grade | Finding | Fix |
| --- | --- | --- | --- |
| S-1 | pass | **Commit contents comply.** `ada25cc5` touches exactly 6 files: `.github/workflows/ci.yml` (CI config), `.scratch/implementation/410-design.md` (the issue's design doc), `apps/api/src/modules/backup/backup.policy.ts` + `apps/desktop/scripts/sqlcipher-encryption-proof.mjs` (source), `docs/editions-and-features.md` (docs), `tests/sqlcipher-encryption-proof.test.mjs` (tests). Every file is in AGENTS.md's allowed set. | none |
| S-2 | pass | **Source-only staging rule.** `git diff --cached --name-only` is empty; the commit carries no generated output (no `dist/`, no `node_modules/`, no lockfile churn). | none |
| S-3 | pass | **Enforcement suites green at HEAD.** `workflow-assets` 9/9, `repo-hygiene` 3/3, `check:sqlcipher-proof` 14/14 (up from 11 — the four new tests). No workflow-structure test broke on the conditional `runs-on`. | none |
| S-4 | low | **Comment/doc drift introduced with the conditional runner.** `ci.yml:386` and `docs/development-workflow.md:377` still state the job is unconditionally Windows. | one clause each: "…uses `windows-latest` when the `encryption` filter matches, `ubuntu-latest` (skipped echo only) otherwise". |
| S-5 | low | **Same-class stale citations survive in the file the commit cleaned.** `docs/editions-and-features.md:93` and `:109` cite `lib.rs:2052` for the `LicenseManager::initialize` handoff; at HEAD `:2052` is inside `spawn_api_process` (declared `:2049`), and the `initialize` call is at `:2141` (`env_clear()` at `:2099`). | drop those inline numbers too, or re-anchor. Not a regression — pre-existing, and outside round 1's three-item scope. |
| S-6 | low | **Round-1 S-4 residual:** the #410 review evidence is on disk but untracked and absent from every commit. | one `docs(review): #410 round-N evidence` commit before merge (the repo's own pattern: `docs(review): …` in `git log`). |
| S-7 | pass | **Smell baseline.** No new Duplicated Code, Feature Envy, Primitive Obsession, Repeated Switches, Shotgun Surgery, Speculative Generality, Middle Man, or Message Chains in the fix commit. The duplicated probe sources and the un-shared `SQLITE_HEADER_MAGIC` remain deliberate and now carry the one-sentence rationale the design pass asked for. The `write` fixture helper duplicated between the two snapshot tests (`tests/…:96-104` vs `:65-72`) is test-local and not worth extracting. | none |

**Standards totals: 7 checks — 4 pass, 0 high, 0 medium, 3 low.**

---

## SPEC axis — issue #410, requirement by requirement (current code)

| # | Requirement | Status | Enforcing path at `ada25cc5` | Changed by the fix commit? |
| --- | --- | --- | --- | --- |
| R1 | Build the sidecar with the real SQLCipher dependency, no `--allow-plaintext` | **satisfied** | `ci.yml:423-425` `pnpm --filter @tuari/desktop sidecar:build`; no-waiver hard throw in `build-sidecar.mjs` (`enforceSqlcipherGate`). | no |
| R2 | Assert `PRAGMA cipher_version` non-empty on the built binding | **satisfied** | proof `[2/5]`, `proof.mjs:436-440`, via single-sourced `probeSqlcipherBinding` (`sqlcipher-availability.mjs`); emptiness guard lives inside that helper. | no |
| R3 | Keyed open + write + close, then assert the file does not start with `SQLite format 3` | **satisfied** | `WRITE_ROW_PROBE_SOURCE` (`proof.mjs:254-266`) run by the bundled Node with `cwd = runtimeDir`, then `assertNotPlaintextDatabase` (`proof.mjs:366-386`) at `:449`. | helper **renamed only** (`assertEncryptedDatabase` → `assertNotPlaintextDatabase`); enforcement identical, and the new name no longer over-claims. |
| R4 | Reopen with the key and read the row back | **satisfied** | `READ_ROWS_PROBE_SOURCE` (`proof.mjs:268-279`) + the marker assertion at `proof.mjs:455-463`. | no |
| R5 | Fail the job otherwise; wired into desktop/CI, not the publish gate only | **satisfied** | Exit-code plumbing `main().catch(...)` → `process.exitCode = 1` (`proof.mjs:552-558`); job wiring `ci.yml:393-441`, path-gated on `detect.outputs.encryption` (`ci.yml:115-123`); not invoked by `release.yml`/`beta.yml`/`nightly.yml`. | no |
| + | *Beyond spec:* the keyed daily backup is proven non-plaintext and key-readable | delivered | `[5/5]` boots `dist/index.cjs` under `node.exe` with `APP_DB_KEY`, waits for `/health`, then the real `VACUUM INTO` snapshot; asserted marked, non-plaintext, key-readable, and **superset of the live table set** (`proof.mjs:505-531`). The fix commit loosened table *equality* to *subset* — still enforced, and the loosening is the fix for round-1 N2. | comparison semantics only |

**Scope creep:** none added by the fix commit. It also did not weaken any requirement: the only two behavioural edits are (a) stricter `parseArgs` (an unrecognised argument is now an error) and (b) the clearer directory rejection.

---

## Consolidated findings

**HIGH — none.**

**MEDIUM — none.** Round-1's only medium (S-1, the billed Windows VM) is fixed at `ci.yml:400`.

**LOW**

1. `?? .scratch/reviews/410/` — the #410 review evidence (round-1 raw files + this report) is untracked and in no commit; round-1 S-4's "staged for commit" half is unmet. `git status --short`, `git diff --cached --name-only` (empty). Parent action.
2. `ci.yml:386` and `docs/development-workflow.md:377` — stale "windows-latest / the only non-Ubuntu job" wording; the job is now conditional (`ci.yml:400`).
3. `docs/editions-and-features.md:93`, `:109` — `lib.rs:2052` does not resolve to the cited `LicenseManager::initialize` handoff (that is `lib.rs:2141`; `:2052` is inside `spawn_api_process`). Same class the commit removed from `:195-197`/`:279`.
4. `tests/sqlcipher-encryption-proof.test.mjs:152-166` — the new structural guard is *presence*-only: it asserts both probe sources contain `key`/`cipher_compatibility`, not that the key pragma precedes the write. A reorder that moved `db.pragma("key = …")` after the `INSERT` would still pass the unit suite (the Windows job would catch it). Cheap hardening if wanted; not required.
5. `apps/desktop/scripts/sqlcipher-encryption-proof.mjs:512-523` — the subset rationale ("the live database may add a table between the snapshot and this read") does not match the code's ordering: `liveTables` is read at `:497`, *before* the snapshot (`:505-509`), so the case named cannot occur. The conclusion is right and the check is sound; only the stated reason is off by one direction. Also worth knowing: subset drops the old "no extra tables in the backup" direction, which is unreachable through `VACUUM INTO` of the live DB.

## Checked and found nothing actionable

- **Conditional `runs-on` validity, `needs` resolution, and the Ubuntu-path skip echo** — verified above; `actionlint` clean.
- **`assertNotPlaintextDatabase`'s new directory branch** (`proof.mjs:370-377`) — no path can now throw a raw `EISDIR` from the enforcement point; `readFileHeader` is only reached after the `isFile()` gate.
- **The subset change cannot reintroduce a silent-green** — a table missing from the backup still reds; the only thing loosened is extra tables.
- **The `encryption` filter set** (`ci.yml:115-123`) covers the sidecar build, API, contracts, infra, the proof's own test, the workspace + lockfile, root `package.json`, and `ci.yml` itself — the surfaces that can change the native build or the proof.
- **`workflow_dispatch` (`ci.yml:130-136`)** still forces `encryption=true`, so the manual path keeps reaching Windows.
- **Commit hygiene of `ada25cc5`** — 6 files, all allowed, no generated output, no staged files.
- **E5 (`findSnapshotDatabase` on a `backupsRoot` that is a file → raw `ENOTDIR`)** — real but unreachable: the caller creates the root with `mkdirSync` (`proof.mjs:404-406`). Left as-is deliberately.
- **Smell baseline** and **explicitly deferred follow-ups** FU1/FU2/FU3 + `user_version` — no blockers; the deferral decision itself is sound (see item 18).

## What remains UNPROVEN (stated, not implied)

This workstation cannot run the native path (`node-gyp` fails configure; no Windows SDK; no release artifact). Therefore:

- **Spec steps 1–5 execute only on the Windows runner and have never been observed green here.** R1–R5 are verified by reading the code and by unit-testing the pure helpers — no keyed write against a real SQLCipher addon ran on this machine.
- Specifically unverified: that `pnpm --filter @tuari/desktop sidecar:build` succeeds on `windows-latest` with no waiver; that the built binding returns a real `cipher_version`; that the keyed-write probe resolves `better-sqlite3-sqlcipher` from `cwd=runtimeDir`; that the shipped runtime honours `APP_DB_PATH`/`APP_DB_KEY`/`APP_BACKUPS_ROOT` and takes a backup inside 120 s.
- The conditional `runs-on` was validated statically (`actionlint`, documented context availability), not by a live run.
- The first red Windows run is still possible from anything not executable here; the PR should say so plainly rather than imply the gate has been observed passing.
- Not run by instruction: the `apps/api` and `apps/web` suites.

## Commands run (read-only)

- `node --test --test-timeout=30000 ./tests/workflow-assets.test.mjs` → 9 pass / 0 fail
- `node --test --test-timeout=30000 ./tests/repo-hygiene.test.mjs` → 3 pass / 0 fail
- `node --test --test-timeout=30000 ./tests/sqlcipher-encryption-proof.test.mjs` → 14 pass / 0 fail
- `actionlint .github/workflows/ci.yml` → exit 0
- `git diff 8e729c4d..HEAD`, `git show --stat --name-only HEAD`, `git log --oneline d6164c65..HEAD`, `git status --short`, `git diff --cached --name-only`
- Targeted greps: `assertEncryptedDatabase` repo-wide, `runs-on`/`encryption ==` in `ci.yml`, `lib.rs` anchors (`initialize` 912/1074/2141, `env_clear()` 2099), `docs/editions-and-features.md` citations, `workflow-assets` assertions about `runs-on`
