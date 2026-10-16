## Verdict

**APPROVE** — the round-1 fixes are correct and complete; the fix commit introduces no new defect. No blocker, no fix-now item.

**Unproven, stated not implied:** this workstation cannot run the native path (`node-gyp` configure fails, no Windows SDK, no release artifact). Spec steps 1–5 execute only on the Windows runner. **No green `prove-encryption` run has been observed here.** Everything below is static reading plus the two cheap unit suites.

---

## Outcome

**Clean.** 18/18 round-1 items verified against current code: 17 fixed, 1 partly fixed (bookkeeping only). 0 fix-now, 0 new blockers, 1 refreshed follow-up note.

Commands run (read-only, local): `node --test ./tests/sqlcipher-encryption-proof.test.mjs` → **14 pass / 0 fail**; `node --test ./tests/workflow-assets.test.mjs` → **9 pass / 0 fail**; `grep` for the retired symbol (no live references remain).

### Round-1 items re-verified at `ada25cc5`

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | S-1 conditional `runs-on` | **fixed** | `ci.yml:400` — `${{ needs.detect.outputs.encryption == 'true' && 'windows-latest' \|\| 'ubuntu-latest' }}`. Valid GHA expression; `needs` is available to `runs-on`. Skipped path now bills Ubuntu, not Windows. |
| 2 | S-2 stale line citations | **fixed** | `docs/editions-and-features.md:196,197,278` are file-only now; the `lib.rs:2102`, `:2025`, `license.ts:168` numbers are gone. |
| 3 | S-3 publish-workflow sentence | **fixed** | `docs/editions-and-features.md:227-231` rewritten; no workflow passes `--allow-plaintext`, and the text no longer claims one does. Reconciled with the "not the code" heading. |
| 4 | S-4 artefact + staged evidence | **partly fixed** | Artefact exists at `.scratch/reviews/410/raw/8e729c4d…-design-pass.md`. But `git status` shows `?? .scratch/reviews/410/` — still **untracked, nothing staged**. "Staged for commit" is not true yet; the parent must commit it (AGENTS.md:37, "keep committed while the PR is open"). Bookkeeping, not code. |
| 5 | filter gap `tests/**` | **fixed** | `ci.yml:122` adds `tests/sqlcipher-encryption-proof.test.mjs`. |
| 6 | MEDIUM-1 probe structural test | **fixed** | `export const WRITE_ROW_PROBE_SOURCE` (`proof.mjs:254`), `READ_ROWS_PROBE_SOURCE` (`:268`); the structural test passes (14/14). Deleting the key pragma now fails the unit suite, not only the runner. |
| 7 | MEDIUM-2/E6 schema-only backup | **fixed (documented)** | `410-design.md:101-107` records the accepted limitation; the proof comment now says "a schema check, not a data check" (`proof.mjs:519-523`). |
| 8 | MEDIUM-3/E1 newest-complete fallback | **fixed** | Test pins `findSnapshotDatabase` → newest *complete* backup. |
| 9 | LOW-1/E2 directory label | **fixed** | `proof.mjs:370-377` — explicit `found a directory` branch; test asserts `/probe: … found a directory/`. |
| 10 | LOW-2/E4 parseArgs leniency | **fixed** | `proof.mjs:220-226` throws on any unrecognised arg; sole invocation `ci.yml:438` passes no positional, so nothing breaks. |
| 11 | LOW-3/E3 16-byte boundary | **fixed** | Boundary test asserts `assertNotPlaintextDatabase(boundary) === 16`. |
| 12 | N1 wrong citation | **fixed** | Covered by item 2. |
| 13 | N2 spurious live↔backup red | **fixed** | `proof.mjs:524-530` is now a subset test (`missingTables`); live read at T0, snapshot ⊇ live, so no false red. |
| 14 | N4 "pinned devDependency" | **fixed** | `docs:217-219` → "its own devDependency (the version is pinned by the lockfile)". |
| 15 | F1 rename | **fixed** | `proof.mjs:366`; `grep assertEncryptedDatabase` hits only old review artifacts, zero live code. |
| 16 | F2 owner-side pointer | **fixed** | `backup.policy.ts:33-38`. |
| 17 | F3 two-duplication rationale | **fixed** | `410-design.md:36-39` + `proof.mjs:135-141`. |
| 18 | FU1/FU2/FU3 deferral | **correct** | Deferral stands; not re-raised (see architecture section). |

### The three fix-now items judged on their merits

- **(a) `assertNotPlaintextDatabase` — right name.** `proof.mjs:366-382` proves "not the 16-byte SQLite magic". "Not plaintext SQLite database" is exactly that set; the residual (2048 bytes of `0xab` passes) means *not proven ciphertext*, not *proven plaintext* — the name no longer over-claims, and the docstring (`:355-364`) says the keyed read-back closes the gap. The over-claim moved from the name to the docstring, which is the correct place. No trade of one imprecision for another.
- **(b) `backup.policy.ts:33-38` — right place, right words.** On the runtime-owning constant (`BACKUP_DIRECTORY_NAME_PATTERN`), names the proof file + function, names `backup.service.ts` as owner of the other two names, and states the failure mode ("turns the encryption gate red"). Actionable and correct. Nit only: `backup.service.ts`'s `BACKUP_DB_FILE_NAME` / `BACKUP_MARKER_FILE_NAME` carry no reverse pointer; F2 asked for the policy-side one, so satisfied.
- **(c) `410-design.md:36-39` — states the rationale, stops re-litigation.** It names the distinguishing fact: the magic is fixed by the SQLite format (a second copy cannot drift, sharing buys nothing); the folder names are a project decision that can change (so the copy carries drift risk, mitigated by failing closed). That is the question round 1 asked, answered in one place, mirrored in the `findSnapshotDatabase` comment.

### Outward question — did the fix commit create friction?

- **CI job graph:** the conditional `runs-on` (`ci.yml:400`) is a repo-unique idiom — every other job uses a static runner — so a maintainer now has to know this job's *platform* is path-dependent, not just its steps. A 4-line comment sits directly above it, so the friction is small; this is a **note**, not a finding.
- **Proof interface:** the rename is a breaking change for importers, but `grep` finds none outside the test; the stricter `parseArgs` matches the only invocation (`ci.yml:438`, no flags); exporting the two probe sources widens the module API for a test-only reason, which is the intended test seam. No new required flag, no new caller obligation.
- **Docs:** dropping line numbers removes drift. No new friction.

---

## Skill: domain-modeling

- **D1 rename — resolved, no new finding.** `proof.mjs:366` + tests + design doc all use `assertNotPlaintextDatabase`; the retired name is gone from live code. Vocabulary now matches the repo's (the API's own predicate is a magic check, not an encryption proof).
- **D2 `snapshot` vocabulary — no finding (unchanged).** Still the owner's term; the doc comment still names the owner file.
- **D3 rationale recorded — resolved, no new finding.** `410-design.md:36-39`, mirrored at `proof.mjs:135-141`.
- **No new domain-modeling findings.** The new `missingTables` naming (`proof.mjs:524`) states the invariant ("what the backup is missing"), consistent with the file's style.

## Skill: codebase-design

- **C2 backup-layout duplication — file-follow-up stands, deferral correct.** `proof.mjs:142` still re-declares the `YYYY-MM-DD` pattern / `tuari.sqlite` / `snapshot.json` owned by `backup.policy.ts` / `backup.service.ts`. The seam is blocked by module format (bare `.mjs` vs TypeScript); single-sourcing is a cross-package build-order change and belongs in its own issue. Exact text:

  > **Title:** Single-source the backup layout shared by `backup.service.ts` and the encryption proof
  > **Body:** `apps/desktop/scripts/sqlcipher-encryption-proof.mjs` durably re-declares the `YYYY-MM-DD` folder pattern, `tuari.sqlite`, and `snapshot.json`. The proof deliberately fails closed, but a layout rename turns the gate red for a non-encryption reason. Move the three names into `packages/contracts` (built in every CI path, including the proof job) and re-export from `apps/api/src/modules/backup/backup.policy.ts` / `backup.service.ts` so no caller moves. Out of scope for #410.

- **C5 `cipher_compatibility = 4` mirrors — file-follow-up stands, deferral correct.** Still mirrored between the proof's probe sources and `factory.ts` / `backup.snapshot.ts`; they agree today (fail-closed if they drift). Exact text:

  > **Title:** Document or centralize the `cipher_compatibility = 4` encryption parameter
  > **Body:** The value is hand-mirrored in `apps/api/src/infrastructure/database/factory.ts`, `backup.snapshot.ts`, and both probe sources in `sqlcipher-encryption-proof.mjs`. A change on the API side reds the gate for a reason unrelated to encryption being broken. Either single-source it or add a comment on each mirror. Out of scope for #410.

- **No new codebase-design finding.** The subset change (`proof.mjs:524-530`) deepens the check's honesty (it now says what it does) without adding surface; `keyedTableNames` remains the weakest joint but is reachable only from the runner (unchanged note).

## Skill: improve-codebase-architecture

- **A1 path-filter lists / required-status contract — file-follow-up stands, and this commit sharpens the case.** The `encryption` filter (`ci.yml:111-127`) is still a hand-maintained third list, and `tests/workflow-assets.test.mjs` still asserts nothing about path-filter contents. The fix commit makes the required-check contract *slightly more subtle* by making `runs-on` conditional, so a future contributor who "cleans up" that expression could change where the required check reports. Exact text:

  > **Title:** Assert the path-gated jobs' required-status contract in `workflow-assets`
  > **Body:** Every path-gated job in `ci.yml` satisfies its required status check only because the job always runs with gated steps and a skipped echo. Nothing asserts this, and nothing asserts path-filter contents. Add a `tests/workflow-assets.test.mjs` assertion that each gated job (incl. `prove-encryption`) has no top-level `paths:`/`if:` that would stop the check reporting. Out of scope for #410.

- **No new architecture finding.** The conditional runner is contained in one expression with a comment; it does not add a new job or a new shared abstraction.

---

## Checked and found nothing

- No live reference to the retired `assertEncryptedDatabase` (only old review artifacts in `raw/`).
- `detect` exposes the `encryption` output (`ci.yml:76`) consumed by the job's `runs-on` and every step `if` — the expression cannot silently evaluate to the wrong runner because the output is defined.
- The proof invocation (`ci.yml:438`) passes no positional, so the stricter `parseArgs` cannot break the shipped call path; no doc shows a positional invocation either.
- The 14-test proof suite and 9-test workflow-assets suite pass locally; the new structural probe test actually matches `db.pragma("key = ` and `cipher_compatibility = 4"` in both probe sources.
- The fix commit touches 6 files, all inside AGENTS.md's allowed set (workflow, script, test, API comment, docs, design doc); no stray scratch noise added.
- Design doc "Changed contracts" / "Tests" / "Risks" agree with the code as it now stands (`assertNotPlaintextDatabase`, the subset check, the schema-only limitation).
- No stray tangent: the fix commit did not reach into FU1/FU2/FU3 scope.

**file-follow-up (refreshed):** FU2's required-status assertion. **Blocker: none.** **fix-now: none.**