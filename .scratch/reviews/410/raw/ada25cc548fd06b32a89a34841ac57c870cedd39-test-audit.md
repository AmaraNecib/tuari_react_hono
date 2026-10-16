# Test audit — #410 encryption proof @ `ada25cc5` (base `d6164c65`, round 2)

## Verdict

**APPROVE** — no blockers, no HIGH, no MEDIUM. The round-1 fix commit is real work: the central hole (the unit suite could not notice a deleted key pragma) is closed by a guard I verified empirically, and 11 of the 13 round-1 items are fully fixed. Two items are **partly fixed** (S-2 stale doc citations still present twice; S-4 design-pass artefact / untracked evidence), both LOW, both docs/process only.

Review-only run: no file changed except this report. Store for the run: see the `acceptance-report` block in the final answer.

---

## 1. Command results (run here, read-only)

`pnpm check:sqlcipher-proof` → **14 tests, 14 pass, 0 fail, 0 skipped, ~715 ms**:

| # | Test |
| --- | --- |
| 1 | isPlaintextSqliteFile recognises the SQLite magic |
| 2 | isPlaintextSqliteFile rejects SQLCipher's encrypted header |
| 3 | a truncated or empty file is not proof of encryption |
| 4 | findSnapshotDatabase returns the newest dated backup |
| 5 | findSnapshotDatabase ignores folders that are not snapshots |
| 6 | **findSnapshotDatabase falls back to the newest complete backup** (new, round-1 MEDIUM-3/E1) |
| 7 | **assertNotPlaintextDatabase rejects a database that is missing, a directory, too small, or plaintext** (extended, round-1 LOW-1/E2) |
| 8 | **assertNotPlaintextDatabase accepts a non-plaintext file at and above the header size** (extended, round-1 LOW-3/E3) |
| 9 | **the probes apply the key before they touch the database** (new, round-1 MEDIUM-1) |
| 10 | requiredRuntimeFiles names the shipped binding, entry point and interpreter |
| 11 | parseArgs defaults to the sidecar build output |
| 12 | parseArgs honours overrides and rejects unknown flags |
| 13 | **parseArgs rejects a single-dash typo or a bare positional instead of ignoring it** (new, round-1 LOW-2/E4) |
| 14 | parseArgs rejects a flag with no value and a non-numeric timeout |

Also run: `pnpm check:workflow-assets` → 9 pass / 0 fail. `pnpm check:repo-hygiene` → 3 pass / 0 fail. Not run (deliberate): the api/web suites (heavy, lane slot) and anything needing the Windows SDK.

---

## 2. THE CENTRAL QUESTION — would the unit suite notice a deleted key pragma?

**Yes. The guard is real, and I tested the mutation rather than trusting the test name.**

Mutation applied **in memory** to `apps/desktop/scripts/sqlcipher-encryption-proof.mjs` (no file written), then the guard's exact regexes were evaluated against the mutated constant:

| Mutation to the probe source | `/db\.pragma\("key = /` | Verdict on test 9 |
| --- | --- | --- |
| current source | `true` (write), `true` (read) | green |
| **delete the keyed pragma line** | `false` (write), `false` (read) | **red — `assert.match` throws** |
| delete the `cipher_compatibility` line | `false` (write), `false` (read) | red |
| rewrite as `db.pragma("PRAGMA key = ?", [key])` | `true` | green (still applies the key — correct) |

Which regex stops matching, precisely: the array element `'db.pragma("key = \'" + key + "\'");'` joins into the text `db.pragma("key = '" + key + "'");`. The literal substring `db.pragma("key = ` is what `/db\.pragma\("key = /` matches. Remove the element (or rename the pragma) and no substring matches, so `assert.match` throws and test 9 fails. This is a **real guard for the pragmatic mutation the round-1 finding named** — not a test that passes for another reason. Test 9 imports the two constants from the module under test and asserts on their text; there is no indirection that could make it pass while the pragma is gone.

**Scope limit, stated plainly:** the guard is textual. It cannot prove *ordering* (the pragma could be moved after the `INSERT` and the guard stays green; the runner's step 3 would then fail because SQLCipher rejects the write), and it says nothing about the `TUARI_PROOF_KEY` wiring in `runProof`. A mutation that deletes `TUARI_PROOF_KEY: key` from the write probe's env leaves the unit suite green. That mutation still cannot ship silently — an unkeyed write produces the plaintext magic and step 3 goes red on Windows — so it is a CI-catchable hole, not a silent one. Test 9's *name* ("apply the key before they touch the database") over-claims the ordering part; its body guards presence only. LOW-3.

### Assertion → enforced by → would-it-fail

| Spec assertion | Enforced by (file:line) | Would it fail if the guarantee is removed? | Where the net is |
| --- | --- | --- | --- |
| 1. Runtime holds a loadable SQLCipher binding | `requiredRuntimeFiles` (`sqlcipher-encryption-proof.mjs:105`) + `inspectSqlcipherArtifact` (`sqlcipher-availability.mjs:39`) | Yes — missing package/file → "not built with the real SQLCipher dependency" | **CI only** (existence + file list) |
| 2. `PRAGMA cipher_version` non-empty | probe exits 3 on empty (`sqlcipher-availability.mjs:157-160`) + wrapper throw (`:196-201`); unit tests at `sqlcipher-availability.test.mjs:149`, `:222` | Yes | unit + CI |
| 3. Keyed write leaves a NON-plaintext file | `assertNotPlaintextDatabase(roundTripDb, "keyed write")` (`:446`, CI) **+ test 9's structural guard (unit)** | Yes. Deleted pragma → unit test 9 red **and** step 3 red | **unit (textual) + CI (real)** |
| 4. Reopen WITH the key reads the row | exact `readBack.length !== 1 \|\| readBack[0].marker !== marker` (`:455`) | Yes — wrong/absent key gives 0 rows or wrong marker | CI only |
| 5. Shipped runtime boots keyed; live DB non-plaintext, ≥1 table, key-readable | `assertNotPlaintextDatabase(liveDb, …)` (`:485`) + `keyedTableNames` (`:487`) | Yes | CI only |
| 6. Daily backup non-plaintext, marked, tables ⊇ live | `findSnapshotDatabase` requires `snapshot.json` (`:145`) + `assertNotPlaintextDatabase(snapshot, …)` (`:508`) + subset check (`:527`) | Yes for marker/plaintext/missing-table; **no** for missing rows (accepted, documented) | CI only |
| 7. Unit tests actually run in CI | `ci.yml` lint step `pnpm check:sqlcipher-proof`; root `package.json:13` | n/a — 14/14 here | unit |

---

## 3. Round-1 findings, re-verified against the CURRENT code

| # | Round-1 item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | code-review S-1: unconditional `runs-on: windows-latest` | **Fixed** | `ci.yml` — `runs-on: ${{ needs.detect.outputs.encryption == 'true' && 'windows-latest' \|\| 'ubuntu-latest' }}`; steps still individually gated on `needs.detect.outputs.encryption == 'true'`; skipped-echo step for the required check is on the false branch. Residual (not a defect): an unrelated same-repo PR now provisions ~1 billed Ubuntu minute instead of ~1 billed Windows minute, and fork PRs skip the job entirely — both pre-existing patterns. |
| 2 | S-2: stale `lib.rs:2102` / `:2025` / `license.ts:168` | **Partly fixed** | The three citations the commit touched are gone (`docs/editions-and-features.md:196-197`, `:277-279` now file-only). But the *same* stale citation survives twice elsewhere in the file: `grep -Hn "license.ts:168" docs/*.md` → `docs/editions-and-features.md:42` and `:47` (round-1 verified actual `:172`). A third of the file is still full of `file.ts:NNN` citations (≈28 more), unchanged. See LOW-1. |
| 3 | S-3 / N5: "publish workflows keep shipping the fallback" | **Fixed** | Sentence rewritten to "once that stack is released, no publish build can package a plaintext artifact by accident. The feature still stays parked until `encrypted_db` is added to a licence…". `grep -rn "keep shipping the fallback" docs/` → no match. The two competing "remaining work" lists now agree: release of the stack is a prerequisite, the licence is the remaining condition. |
| 4 | S-4: AGENTS.md design-pass artefact + untracked `.scratch/reviews/410/` | **Partly fixed** | `.scratch/reviews/410/` still contains **only `raw/`** (plus this report) — no `<HEAD>-design-pass.md` at the AGENTS.md path for `ada25cc5`. A design-pass record for the *previous* head lives at `raw/8e729c4d…-design-pass.md`. `git status --short` → `?? .scratch/reviews/410/`; `git diff --cached` → empty. Evidence is not staged, and `.gitignore:45` un-ignores `/.scratch/reviews/` so it can be. See LOW-2. |
| 5 | Filter gap: `tests/**` missing from the `encryption` filter | **Fixed** | `ci.yml` `encryption` paths-filter now lists `- 'tests/sqlcipher-encryption-proof.test.mjs'` with a comment. Other root config the native build consumes (`.npmrc`) is still uncovered — unchanged, low. |
| 6 | test-audit MEDIUM-1: deleted key pragma invisible to units | **Fixed — verified by mutation** | Executable `export const WRITE_ROW_PROBE_SOURCE` / `READ_ROWS_PROBE_SOURCE` + test 9. Mutation result in §2: deleting either pragma makes test 9 red. |
| 7 | MEDIUM-2 / N3 / E6: schema-only live-vs-backup | **Fixed as documented** | Design doc `410-design.md` "Risks": "**The live-vs-backup check is a schema check, not a data check.** … Accepted limitation, recorded rather than implied." Inline comment at the comparison says the same. Behaviour unchanged **by design** — the hole is now named, which is what the finding asked for. |
| 8 | MEDIUM-3 / E1: untested newest-invalid fallback | **Fixed** | Test 6 pins the newest *complete* backup (`2026-03-02` without `snapshot.json` → returns `2026-03-01/tuari.sqlite`). Fails if the fallback is replaced by `return null`. Contract decision is now encoded, as round-1 asked. |
| 9 | LOW-1 / E2: raw EISDIR, no label | **Fixed** | `assertNotPlaintextDatabase` stat-checks `isFile()` and reports "found a directory" / "found a special file"; test 7 asserts `/probe: expected a database .* found a directory/`. |
| 10 | LOW-2 / E4: single-dash typo / bare positional ignored | **Fixed** | `parseArgs` `default:` now throws unconditionally; test 13 covers `-runtime` and a bare positional. The now-rejected `--runtime=./x` form is called out in the comment. |
| 11 | LOW-3 / E3: 16-byte boundary unasserted | **Fixed** | Test 8 asserts `assertNotPlaintextDatabase(boundary) === 16` and the 2048 case. Fails if the size guard becomes `<=`. |
| 12 | debate N1: wrong line citation | Covered by item 2 above |
| 13 | debate N2: spurious red from live-vs-backup equality | **Fixed** | Subset comparison `liveTables.filter((t) => !snapshotTables.includes(t))`. Order in `runProof` is unchanged (live tables read before `waitForSnapshot`), but a backup that gained tables relative to that read is now tolerated while any *missing* table still throws. Direction is right; `missingTables` message names them. |
| 14 | debate N4: "pinned devDependency" vs caret | **Fixed** | Text now "its own devDependency (the version is pinned by the lockfile)"; `apps/desktop/package.json` has `"node-gyp": "^11.5.0"` — the new sentence is accurate. |
| 15 | design-pass F1: rename `assertEncryptedDatabase` | **Fixed** | `grep -rn assertEncryptedDatabase` outside `.scratch/` → no match; script, tests and design doc all use `assertNotPlaintextDatabase`. Docblock explains what the name does and does not establish. |
| 16 | design-pass F2: owner-side pointer in `backup.policy.ts` | **Fixed** | `apps/api/src/modules/backup/backup.policy.ts:27-37` docblock names the proof script and `findSnapshotDatabase`, and says a rename here turns the gate red. |
| 17 | design-pass F3: why duplicated names but un-duplicated magic | **Fixed** | `410-design.md` decision 3 + the `findSnapshotDatabase` docblock both carry the argument (format-fixed magic cannot drift; the folder layout is a project decision that can, mitigated by failing closed). |
| 18 | Deferred follow-ups (FU1-3, `user_version`) | **Respected** | Not re-raised as blockers. The deferral is coherent: each is a new check, not a fix to this gate, and the design doc records the one gap (rows) it leaves behind. |

---

## 4. Role 1 — EDGE CASE HUNTER

Findings that survive (all LOW, none blocking):

- **`--runtime -h` is accepted as the value `-h`.** `valueFor` only rejects values starting with `--`, so `parseArgs(["--runtime", "-h"])` returns `runtimeDir = path.resolve("-h")` — silently. Asymmetric with the new strictness one line above (`-runtime ./x` now throws). The failure surfaces later as "missing the built sidecar entry at …/api-runtime/dist/index.cjs" rather than as a bad argument. Exact test if you want it closed:
  ```js
  assert.throws(() => parseArgs(["--runtime", "-h"]), /--runtime needs a value/);
  ```
  (implied fix: `if (value === undefined || value.startsWith("-"))` in `valueFor`). Judgement: harmless, and `-h` is the only single-dash token the script defines.
- **`statSync` follows a symlink to a directory** → now correctly reported as "found a directory". Good; no action.
- **TOCTOU between `existsSync` and `statSync`** in `assertNotPlaintextDatabase`: if the file disappears in between, Node's `ENOENT` message still carries the path, so the failure stays diagnosable. Pre-existing, not introduced here.
- **Table *names*, never rows**: still the accepted limitation (round-1 MEDIUM-2, documented). No new edge case added by the fix.
- **`parseArgs` now rejects every positional**, including one a future usage might want as the runtime dir. Consistent with the documented usage (flags only). No action.

## 5. Role 2 — COVERAGE ANALYST

- **AC coverage:** unchanged and honest. Spec steps 3-5's *enforcement expressions* live inside `runProof`, which cannot execute without the native binding, so they are CI-only; the unit suite covers the pure helpers plus the new textual guard. The design doc says exactly this. No claim of unit coverage is made that the code does not deliver.
- **New code with zero coverage: the subset comparison.** The fix commit rewrote the live-vs-backup comparison (`missingTables` filter, `:520-532`) — changed semantics, no test, because it sits in the unexported body of `runProof`. Round-1 made the same excuse for the equality check; the fix had the chance to extract it for free. Suggest: export a pure helper and test it, e.g.
  ```js
  export const missingBackupTables = (liveTables, snapshotTables) =>
    liveTables.filter((table) => !snapshotTables.includes(table));
  ```
  ```js
  test("missingBackupTables reports tables the backup lacks and ignores extra ones", () => {
    assert.deepEqual(missingBackupTables(["users", "invoices"], ["users"]), ["invoices"]);
    assert.deepEqual(missingBackupTables(["users"], ["users", "sqlite_sequence"]), []);
  });
  ```
  LOW: the red direction is fail-closed and the Windows job still enforces it.
- **Diversity:** good — tempdir file fixtures, `deepEqual` on exact path lists, labelled-regex assertions on error text, injected `readdir` seam, structural text assertions on the probe sources.
- **Duplicates:** `isPlaintextSqliteFile` (tests 1-3) and `assertNotPlaintextDatabase` (tests 7-8) overlap at two layers; both earn their place (predicate vs labelled enforcement point). Keep.
- **Missing, low value:** nothing asserts `runProof` passes `TUARI_PROOF_KEY` / `TUARI_PROOF_MARKER` into the probe env — the guard covers the pragma text only (see §2 scope limit).

## 6. Role 3 — QUALITY REVIEWER

**Grade: A-.** Every new test fails for the right reason; none is an error-message-only test, none is unreachable, none is a duplicate.

- Test 9 is the one I probed hardest for the "asserts the shape, not the behaviour" failure mode — it *is* a shape assertion by construction, but it is the right shape: the constant it inspects is the source that runs on the runner, and deleting the guarantee makes it fail (§2, verified). Its comment states the limitation ("Structural, not behavioural"), so it does not over-claim in prose — only its *name* does ("before they touch").
- Isolation clean: `withTempDir` + `try/finally` per test, no shared state, no ordering coupling. Tests 6-8 each build their own fixtures.
- Names state the invariant; test 7's name is a mouthful but precise, and it now lists all four rejection paths.
- Latent (unchanged, round-1 LOW, still open): `withTempDir` does not await an async `run` body — a future `async` test body would assert after the temp dir is removed and pass vacuously. No test is async today. `assert.equal(x, true)` remains in tests 1-2 (`assert.ok` is cleaner). Cosmetic.

---

## 7. Findings

**HIGH:** none.

**MEDIUM:** none.

**LOW-1 — the round-1 stale-citation cleanup is incomplete.** `docs/editions-and-features.md:42` and `:47` still cite `apps/api/src/infrastructure/license.ts:168`, the exact stale citation round-1 identified (actual `:172`). Fix: make both file-only, as the commit already did at `:196-197` and `:277-279`. Test to add: none (doc); if you want this pinned, a `check`-style assertion is out of scope.

**LOW-2 — S-4 still open: no design-pass artefact at the AGENTS.md path for this HEAD, and the evidence directory is untracked.** `.scratch/reviews/410/` holds only `raw/`; `git status` → `?? .scratch/reviews/410/`; nothing staged. Fix: record `.scratch/reviews/410/ada25cc548fd06b32a89a34841ac57c870cedd39-design-pass.md` and commit `.scratch/reviews/410/` before the PR opens (`.gitignore:45` already un-ignores it). Test to add: none.

**LOW-3 — the new subset comparison has no test.** Exact test: the `missingBackupTables` extraction in §5. Priority: lowest of the three (fail-closed, CI-enforced).

**LOW-4 — test 9's name over-claims ordering.** The guard proves the pragma is *present*, not that it precedes the write. Fix cheaply by renaming to "the probes still apply the key and the cipher compatibility before writing" → or better, "…still apply `key` before writing" is still an order claim; use "the probe sources still apply the key pragma". Comment already says "Structural".

**LOW-5 (carry-over, not from the fix commit) — `withTempDir` cannot await an async body; `assert.equal(x, true)` in tests 1-2.** No action needed unless a test goes async.

---

## 8. What I checked and found nothing on

- **New tests that cannot fail / assert only message shape:** checked each new and changed test against the behaviour it drives — test 6 (`return null` instead of `continue` → red), test 7 (`statSync` `isFile()` guard and the size guard removed → red), test 8 (`<` → `<=` → red), test 13 (`default:` throw removed → green-with-no-throw → red), test 9 (verified by mutation). No unreachable assertion, no assertion on a constant that the production path never reads, no duplicate of an existing test.
- **Round-1 finding 9's message text** matches the production message character for character (`found a directory` / `found a special file`), so the test is not passing on a regex loose enough to accept a generic throw: the label and the reason are both required by the pattern.
- **Leftovers from the rename:** `assertEncryptedDatabase` appears in no file outside `.scratch/`.
- **Workflow wiring the fix touched:** the new filter entry matches the real test filename; the skipped-echo step is the only step on the false branch, so the job still reports a status on an unrelated PR.
- **Enforcement suites:** `check:workflow-assets` 9/9, `check:repo-hygiene` 3/3 at this HEAD.
- **Not re-raised:** the round-1 items closed as fixed or dismissed (`snapshot.json` presence instead of parsing its echoed `encrypted` flag; duplicated backup-layout names; the deferred follow-ups).

## 9. What remains UNPROVEN here (stated, not implied)

- Spec steps 1-5 have **never executed on this workstation**: no Windows SDK, `node-gyp` cannot configure, no release artifact. The only evidence for "the built runtime really encrypts" is the CI job, which by the constraint in this task has not run. `assertNotPlaintextDatabase`'s real subject (a SQLCipher-encrypted file) has never been fed to it by me.
- Test 9 is a **textual** guard. It is the difference between "the unit suite notices a deleted pragma" and "only the runner notices" — it is not evidence that the pragma works.
- The conditional `runs-on` expression was read and reasoned about (`needs` context, `&&`/`||` fallback), not executed; I did not run it against GitHub Actions.
- File:line citations for round-1 items point at this HEAD (`ada25cc5`); the merge/rename history means they move.
