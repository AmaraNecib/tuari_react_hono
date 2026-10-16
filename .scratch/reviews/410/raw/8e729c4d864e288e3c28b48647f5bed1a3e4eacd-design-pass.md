# Design pass — #410 (mandatory merge gate)

- **HEAD reviewed:** `8e729c4d864e288e3c28b48647f5bed1a3e4eacd`
- **BASE:** `d6164c65`
- **Diff:** `git diff d6164c65...HEAD` — 31 files, +6052/−166
- **Skills applied to the whole diff:** `.agents/skills/domain-modeling/SKILL.md`,
  `.agents/skills/codebase-design/SKILL.md`,
  `.agents/skills/improve-codebase-architecture/SKILL.md`
- **Read first:** `.scratch/implementation/410-design.md`, `.scratch/reviews/410/raw/{code-review,test-audit,debate}-9e94d1fe.md`
- **Hard constraint honoured:** the native path (`node-gyp` + release artifact) cannot run on
  this workstation. Nothing in the `prove-encryption` job was executed here.
  Sections marked **unproven** are unproven, not "reviewed and fine".

## Outcome

**Clean enough to merge.** No blockers. Three cheap fix-now items, all cosmetic or naming; three
follow-up issues, none of which should be smuggled into this PR.

| | Count |
|---|---|
| Blocker | 0 |
| fix-now (cheap, in-scope) | 3 — F1 rename, F2 owner-side pointer comment, F3 one-sentence rationale |
| file-follow-up | 3 — FU1 layout single-sourcing, FU2 CI required-status contract, FU3 `cipher_compatibility` mirrors |
| Earlier findings fixed | 8 fixed, 2 partly fixed, 1 dismissed with a citation I verified as valid |

---

## Earlier round (9e94d1fe) — verified against current code, not assumed

| Earlier finding | Status | Evidence at HEAD |
|---|---|---|
| code-review S1 / test-audit H1 — the unit test never ran in CI | **fixed** | `.github/workflows/ci.yml:41` now has `- run: pnpm check:sqlcipher-proof`, in the lint job's explicit root-gate list (the list turbo cannot reach). |
| code-review S2 — a Windows runner paid for on every PR | **fixed** | `.github/workflows/ci.yml:~400-435`: checkout, pnpm, setup-node, install, contracts build, sidecar build, proof are each `if: needs.detect.outputs.encryption == 'true'`; the job itself always runs and has the skipped echo. |
| code-review S3 — stale "shipping later" list in `docs/editions-and-features.md` | **partly verified** | The fix commit touches `docs/editions-and-features.md` and its message says the list and the bare line reference were reworded. I did not re-read the specific bullet in HEAD — treat as claimed, not confirmed. |
| code-review S4 / debate L2 — `parseArgs` accepts a missing or `NaN` value | **fixed** | `sqlcipher-encryption-proof.mjs:151-176` `valueFor`/`timeoutFor`; covered by `tests/sqlcipher-encryption-proof.test.mjs:140-151` (`--runtime` with no value, with a following flag, `soon`, `0`). |
| code-review S5 — inconsistent citation style | **partly verified** | Same caveat as S3. |
| test-audit H2 — assertion #2 (`cipher_version`) could pass vacuously | **dismissed, citation verified valid** | The guard does live in `apps/desktop/scripts/sqlcipher-availability.mjs:182-187`: `if (version === "") throw new Error(... reported no cipher_version; it cannot encrypt)` — and step 2 of the proof calls exactly that function. The guarantee cannot be vacuous. Residual, by design: a non-empty-but-non-version string passes, which is the price of single-sourcing the probe (design doc decision 2). Acceptable. |
| test-audit M1 — `assertEncryptedDatabase` not exported and untested | **fixed** | Exported at `sqlcipher-encryption-proof.mjs:314`; all three rejection paths asserted at `tests/sqlcipher-encryption-proof.test.mjs:87-124`. |
| test-audit M2 — the app's own backup verdict was never observed | **partly fixed, tradeoff stated** | Marker existence is now required (`sqlcipher-encryption-proof.mjs:198-201`) and tested (`test.mjs:61-85`). The marker's `encrypted: true` field is still not asserted, with a stated reason in the design doc ("an echo of the config rather than a verification"). Substituted with a stronger check: backup table set must equal live table set (`proof.mjs:~505-515`). |
| test-audit M3 — the live-DB check is `n > 0` | **not addressed, by design** | `proof.mjs:~475` still only requires ≥1 table. The new live↔backup schema equality is deliberately schema-agnostic, so a half-migrated keyed DB passes both sides equally. This is a stated tradeoff (equality cannot drift with a migration), not an oversight. A `PRAGMA user_version > 0` assertion would close it — cheaper and migration-agnostic; worth adding, but not a gate failure. |
| debate H1 — the job never built `@tuari/contracts` | **fixed** | `.github/workflows/ci.yml:~393-397` builds contracts before `sidecar:build`, with the reason in a comment. |
| debate M3 — marker before "this is a backup" | **fixed** (subsumed by M2) | `proof.mjs:198-201`. |
| test-audit L1/L2 — timeout branches, fork-PR skip | **accepted** | Consistent with the other jobs. |

---

## Skill: domain-modeling

### D1 — `assertEncryptedDatabase` over-claims; the name is not the repo's vocabulary · **fix-now**

`apps/desktop/scripts/sqlcipher-encryption-proof.mjs:314` returns the file size and throws three
messages; the name asserts *encryption*. What it actually establishes is *not a plaintext SQLite
file*. The repo's own test makes the gap explicit and permanent:

- `tests/sqlcipher-encryption-proof.test.mjs:117-124` — "accepts a sufficiently large
  non-plaintext file", fed `Buffer.alloc(2048, 0xab)`, asserts it passes. 2048 bytes of `0xab` is
  not encrypted; it is merely not the magic.

The proof's other wording is already exact ("is a PLAINTEXT database", "too small to be a database
at all"), so the function name is the only place the over-claim lives — and it is the name a
future reader will trust. Proposed canonical term: `assertNotPlaintextDatabase` (or
`requireNonPlaintextFile`), used at `proof.mjs:390`, `:470`, `:495` and the tests.

**fix-now.** Rename in one file plus one test file; zero behaviour change; it removes a name that
competes with what the repo means by "encrypted".

### D2 — `snapshot` is the project's vocabulary, correctly reused · **no finding**

`findSnapshotDatabase` (`proof.mjs:136`) uses *snapshot*, which is the owner's term:
`apps/api/src/modules/backup/backup.service.ts:15` ("Every snapshot folder carries a
`snapshot.json` marker"), `:69` `BACKUP_MARKER_FILE_NAME = "snapshot.json"`, and
`backup.policy.ts:31` owns the folder-name rule. No invented vocabulary; no competitor to the
owner's language. The doc comment at `proof.mjs:190-197` names the owner file. Good.

### D3 — "the layout names are duplicated, the magic is not" is recorded as a fact, not a reason · **fix-now (one sentence)**

`410-design.md` decision 3 and the Risks section say the duplication is deliberate and the shared
predicate is not, but they do not distinguish *why the two duplications have opposite answers*. The
distinguishing fact is the one a future reader needs:

- `SQLITE_HEADER_MAGIC` is fixed by the SQLite file format — it cannot change, so sharing it buys
  nothing (see the deletion test in codebase-design below).
- the folder pattern / `tuari.sqlite` / `snapshot.json` are **project decisions that can change**,
  so duplicating them carries real drift, mitigated only by failing closed.

**fix-now.** One sentence at `410-design.md` "Decision 3"/"Risks" and one clause in the
`proof.mjs:190` comment. Prevents the next reviewer re-litigating exactly the question this pass
was asked.

---

## Skill: codebase-design

### C1 — the proof module is deep and earns its keep · **no finding (deletion test)**

Apply the deletion test to `apps/desktop/scripts/sqlcipher-encryption-proof.mjs` as a whole.
Deleting it does not concentrate complexity — it re-creates the failure mode #410 exists to kill
(a warning in a build log, a green release, a plaintext database). The interface is one CLI
(`--runtime/--node/--*-timeout-ms/--keep`, exit 0/1) over five proofs, a booted artifact, and a
temp workspace. Five callers do not reappear; one irreducible binding does. Deep, not shallow.

### C2 — the backup-layout duplication is real, deliberate, fail-closed — and the seam is blocked by module format · **file-follow-up (FU1)**

`proof.mjs:69-71` re-declares three names the API already exports:

| Proof | Owner |
|---|---|
| `BACKUP_DIRECTORY_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}$/` (`:70`) | `apps/api/src/modules/backup/backup.policy.ts:31` (exported) |
| `DATABASE_FILE_NAME = "tuari.sqlite"` (`:71`) | `apps/api/src/modules/backup/backup.service.ts:66` `BACKUP_DB_FILE_NAME` (exported) |
| `BACKUP_MARKER_FILE_NAME = "snapshot.json"` (`:72`) | `apps/api/src/modules/backup/backup.service.ts:69` `BACKUP_MARKER_FILE_NAME` (exported) |

This is **not accidental duplication** — it is documented, and the failure is fail-closed:
`findSnapshotDatabase` returns `null`, the job reds. That is the right failure for a gate, and it is
why this is a follow-up rather than a blocker.

But the seam is worth naming honestly. The owner's names are *exported* — the constant is already
at a seam. What prevents the proof from crossing it is **module format**: the proof is a bare `node`
script run on the Windows runner from `apps/desktop/scripts/*.mjs` (`.github/workflows/ci.yml:~415`),
and the owner is TypeScript (`backup.policy.ts`). Importing across that is a build/precompile
decision, not a code change — so single-sourcing sprawls, and per the brief it goes in its own
issue rather than being attempted here.

Where the seam *would* go: the three names belong with the shared vocabulary both sides already
depend on — `packages/contracts` (`apps/api` depends on it; it is built by `ci.yml` in every path,
including this job, which the fix commit just added) — and `backup.policy.ts` re-exports them so
callers do not move. That is a deliberate cross-package refactor with a lockfile-visible build
order, i.e. exactly the shape of thing that must not ride along in an encryption-gate PR.

**file-follow-up — FU1** (see exact text below).

### C3 — `SQLITE_HEADER_MAGIC` not shared with the API · **no finding; the decision is correct on the deletion test**

The brief asks whether non-sharing is a real decision or accidental duplication. Evidence: it is
real, documented (`410-design.md` decision 3; `proof.mjs:27-28`, `:66`) — and it is the repo's
*existing* convention, which the design doc does not claim and could:

- `apps/api/src/infrastructure/database/database-key-manager.ts:73` `PLAIN_SQLITE_MAGIC`
- `apps/api/src/infrastructure/database/factory.ts:48` `SQLITE_HEADER` (in-tree via the #402 stack)
- `apps/api/src/modules/backup/backup.service.ts:75` `SQLITE_HEADER_MAGIC`
- `scripts/smoke/installer-smoke.mjs:325` (inline literal)

Delete-the-shared-constant test: if a single shared constant existed, deleting it would not
concentrate complexity — it would re-inline a 16-byte literal whose value is fixed by the file
format and can never be wrong in a way that a second definition would catch. A shared constant buys
zero drift protection here and moves 16 bytes; four independent copies is the *correct* answer for
an invariant that cannot change. Keeping the proof's copy independent of the predicate it proves
also means a bug in the API's predicate shows up as a red job instead of agreeing with itself. No
finding.

### C4 — module depth of `findSnapshotDatabase` / `assertEncryptedDatabase` / `keyedTableNames`

- **`findSnapshotDatabase(backupsRoot, { readdir = readdirSync } = {})`** (`:136`) — shallow by
  line count, but the interface is one arg and the behaviour is "the newest folder that is actually
  a backup", which is the app's own rule; tested through that interface at `test.mjs:61-85`. The
  `readdir` injection looks like an unused seam (no caller supplies it), **but it is repo
  convention** — `apps/desktop/scripts/runtime-staging.mjs:411,531` inject the same way. Consistent,
  not invented. **No finding.**
- **`assertEncryptedDatabase`** — the enforcement point for steps 3–5, exported precisely so its
  three rejection paths cross the interface in tests. Good shape. Its only defect is its name (D1).
- **`keyedTableNames`** (`proof.mjs:~466-475`) — a local closure inside `runProof`, reusing
  `READ_ROWS_PROBE_SOURCE` with the SQL passed via `TUARI_PROOF_SQL`. It is the only thing
  implementing "the file is key-readable" for **both** live DB and backup and it is not reachable
  from any test (the interface is `runProof`, which needs the native runtime). By "the interface is
  the test surface" this is the weakest joint in the module — but reachable only through the
  Windows job, and unfixable locally. **Note**, not a finding: nothing here can be tested off the
  runner anyway.

### C5 — `cipher_compatibility = 4` is now mirrored in a fourth and fifth place · **file-follow-up (FU3)**

The two probe sources pin `cipher_compatibility = 4` (`proof.mjs:181`, `:196`). The API owns that
parameter: `apps/api/src/infrastructure/database/factory.ts:152` and
`apps/api/src/modules/backup/backup.snapshot.ts:40`. They agree today — verified — so the gate is
sound now. The asymmetry that makes this worth recording is that this is an **encryption
parameter**, not a path: if the API ever changes KDF/page-size/compatibility, the proof's reader
stops matching and the job goes red for a reason unrelated to encryption being broken. Fail-closed,
so not a blocker; but it is one more hand-maintained mirror of an encryption decision inside a
gate whose entire purpose is encryption. **file-follow-up — FU3.**

---

## Skill: improve-codebase-architecture

### A1 — the new `encryption` path filter is a third hand-maintained list, and the `detect` job's lists are untested · **file-follow-up (FU2)**

`.github/workflows/ci.yml:95-119` now holds `rust`, `api`, `web`, `e2e`, `encryption`. The new
`encryption` list is *not* a copy of an existing one (it adds `apps/desktop/**`,
`pnpm-workspace.yaml`, `.github/workflows/ci.yml`), so drift cannot be caught by inspection: adding
a new shared input means editing up to four lists, with nothing asserting completeness.

I checked whether the existing gate covers this: `tests/workflow-assets.test.mjs` asserts phase-doc
alignment, workflow/trigger existence, installer-smoke ordering, the gated-release flow, here-string
safety, and key-output ordering — **it does not assert path-filter contents, and it does not assert
the required-status contract.** So both of FU2's halves are genuinely uncovered.

Worse than drift, one specific regression is *silent*: this job, like the other path-gated jobs,
satisfies its required status check only because the job itself always runs with gated steps and a
skipped echo (`.github/workflows/ci.yml:~400`, comment at `:~403-405`). Add a top-level `if:` or a
`paths:` to `prove-encryption` and the required check stops reporting with no test failure — the
same class of silent loss of a guarantee that #410 exists to eliminate, reappearing one level up in
the job graph. A ~10-line assertion in `tests/workflow-assets.test.mjs` (this job must have no
top-level `if`/`paths`, and every `detect` filter must include `pnpm-lock.yaml`) closes it.
**file-follow-up — FU2.**

### A2 — friction for the next person changing the backup layout · **fix-now (F2)**

The mirrored constants point forward (proof → owner, `proof.mjs:190-197`) but nothing points back.
Someone editing `backup.policy.ts` or `backup.service.ts` gets no signal that a Windows-only CI gate
mirrors their names; they discover it as a red run on a job they may not have triggered (it is
path-gated on `apps/api/**`, so it does trigger — for a Windows runner's money).

**fix-now:** one comment line in `apps/api/src/modules/backup/backup.policy.ts` next to
`BACKUP_DIRECTORY_NAME_PATTERN` (`:31`): "mirrored by
`apps/desktop/scripts/sqlcipher-encryption-proof.mjs` (`findSnapshotDatabase`) and asserted nowhere —
change both." Cheapest possible version of FU1's problem, in scope, no behaviour change.

### A3 — friction for the next person changing the CI job graph

The always-runs + all-steps-gated + skipped-echo idiom is now repeated across the path-gated jobs.
In GitHub Actions that is the correct idiom (a reusable workflow would be the only alternative, and
it changes the required-check name), so I am **not** proposing extraction at a count of four. The
friction that matters is A1's: the contract lives in comments only. Folded into FU2.

---

## Follow-up issues — exact proposed text

**FU1 — single-source the backup folder layout between the API and the encryption proof**
> **Title:** `Single-source the backup folder layout (api owner ↔ encryption proof mirror)`
> **Body:** `apps/desktop/scripts/sqlcipher-encryption-proof.mjs:70-72` re-declares
> `BACKUP_DIRECTORY_NAME_PATTERN`, `tuari.sqlite` and `snapshot.json`, which
> `apps/api/src/modules/backup/backup.policy.ts:31` and `backup.service.ts:66,69` already export.
> The duplication is deliberate and fail-closed (a layout change makes the job red), which is the
> right failure for a gate — but the owner cannot import across the `.mjs` → `.ts` boundary, so the
> mirror is hand-maintained. Proposal: move the three names into `packages/contracts` (already
> built by every CI path, including the `prove-encryption` job) with `backup.policy.ts` re-exporting
> them, and have the proof import them. Add a test asserting the proof's resolved values equal the
> owner's exports. Out of scope for #410: it changes build order for a workspace package.

**FU2 — assert the CI required-status contract and path-filter completeness**
> **Title:** `CI: test that path-gated jobs always report, and that detect filters stay complete`
> **Body:** `tests/workflow-assets.test.mjs` does not assert path-filter contents or the
> always-reports contract. A top-level `if:`/`paths:` added to `prove-encryption`
> (`.github/workflows/ci.yml:~400`) would silently stop its required status check from reporting —
> the same silent-loss failure mode #410 exists to remove. Add assertions: (a) jobs with a gated
> step pattern have no top-level `if`/`paths`; (b) every `detect` filter list includes
> `pnpm-lock.yaml` and `package.json` where it builds workspace packages; (c) the new `encryption`
> filter is a superset of `api`.

**FU3 — single-source the SQLCipher connection parameters the proof mirrors**
> **Title:** `Encryption proof mirrors cipher_compatibility; record or single-source it`
> **Body:** `sqlcipher-encryption-proof.mjs` sets `cipher_compatibility = 4` in both probe sources,
> matching `factory.ts:152` and `backup.snapshot.ts:40`. Today they agree. If the API's connection
> parameters change, the proof's *reader* stops matching and the job reds for an unrelated reason.
> Either add a comment in each location naming the other, or expose the connection pragmas from one
> place the proof can consume.

**FU4 (optional, small) — close test-audit M3**
> `assertEncryptedDatabase`'s live-DB check is `tables >= 1`, and the new live↔backup equality is
> schema-agnostic, so a half-migrated keyed database passes both. `PRAGMA user_version > 0` would
> close it without coupling the gate to a migration list.

---

## Checked and found nothing

Recorded deliberately — silence is not evidence the pass ran.

1. **`SQLITE_HEADER_MAGIC` non-sharing** (`proof.mjs:67` vs `backup.service.ts:75`): deliberate,
   documented, consistent with four pre-existing independent copies, and correct under the deletion
   test (the value cannot change). Not accidental duplication.
2. **`findSnapshotDatabase`'s `{ readdir }` injection** (`proof.mjs:136`): looks like an unused
   seam; it is repo convention (`runtime-staging.mjs:411,531`). Consistent, kept.
3. **`snapshot` vocabulary** (`findSnapshotDatabase`, marker name): the owner's own term
   (`backup.service.ts:15,69`). No invented term competing with `backup.policy.ts`.
4. **The prove-encryption job's own gating and idempotence** (`.github/workflows/ci.yml:~400-435`):
   always-runs + gated steps + skipped echo is the correct GH Actions idiom here; no reusable
   workflow warranted at this count.
5. **`detect`'s `encryption` output plumbing** (`:~76`, `:~133-145`): added to the interface, the
   manual-dispatch override, and the resolve step; no output left unwired (I diffed all three sites).
6. **Whether the proof proves what it claims by construction** — steps 3→4→5 are causally chained
   (write under key → file not magic → reopen under key reads the marker → live boot under key →
   live file not magic → backup not magic → backup schema equals live). No step passes without the
   previous one having run. No shallow path found.
7. **The proof's read of `README/AGENTS`-level rules** — `AGENTS.md` requires this pass to be
   recorded even when empty; that is this section.

## Still unproven (not "verified")

Spec steps 1–5 execute only on a Windows runner. Nothing here proves them:

- `pnpm --filter @tuari/desktop sidecar:build` succeeding on `windows-latest` without
  `--allow-plaintext`, and producing all three paths in `requiredRuntimeFiles`.
- `probeSqlcipherBinding` returning a real `cipher_version` from the *built* binding.
- The keyed-write probe resolving `better-sqlite3-sqlcipher` from `cwd=runtimeDir`.
- The shipped runtime honouring `APP_DB_PATH`/`APP_DB_KEY`/`APP_BACKUPS_ROOT`/`API_PORT` and taking
  a backup inside 120 s.
- That the script's default paths match where the staging code actually writes them.

`node-gyp` fails configure here (no Windows SDK), so these stay unproven until the job runs.

## Method

Read-only. No file in the diff was modified. Commands run: `git log`, `git diff d6164c65...HEAD
--stat`, `git diff … -- .github/workflows/ci.yml package.json`, `git show --stat 8e729c4d`, targeted
`grep` over `apps/api/src`, `apps/desktop/scripts`, `tests/`, plus reading the proof script, the
unit test, `sqlcipher-availability.mjs`, `backup.policy.ts`, `backup.service.ts`, `ci.yml` filter
block, and `tests/workflow-assets.test.mjs` test list. The api/web suites were not run.
