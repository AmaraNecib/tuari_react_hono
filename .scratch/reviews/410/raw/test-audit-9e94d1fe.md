Verdict: **4 of the 5 assertions are enforced by real code; #2 (non-empty `cipher_version`) is unguarded, and none of the 5 has a test that runs in CI.** No files edited.

## Answers to the audit questions

| # | Assertion | Enforced by | Vacuous risk |
|---|---|---|---|
| 1 | built with real SQLCipher (no `--allow-plaintext`) | `.github/workflows/ci.yml:407-409` (flag simply omitted) + `sqlcipher-encryption-proof.mjs:355-368` (files exist) | Structural only; caught transitively by #2/#3 |
| 2 | non-empty `PRAGMA cipher_version` | `sqlcipher-encryption-proof.mjs:379-380` | **Yes** — value stored, never asserted non-empty |
| 3 | keyed write → not `SQLite format 3` | `:388` → `assertEncryptedDatabase` `:316-326` | Partly — any file ≥16 bytes that isn't the magic passes (e.g. zeros); #4 closes it |
| 4 | keyed reopen reads the row back | `:399` (random marker compared) | No — solid |
| 5 | daily backup non-plaintext + key-readable | `:445-455` | Not by a foreign file (fresh `mkdtemp`); but the app's own `snapshot.json`/`encrypted:true` signal is not read |

**Would the tests fail if the guarantee were removed? No.** `tests/sqlcipher-encryption-proof.test.mjs` never calls `runProof` (test:1-19 imports only pure helpers). Delete `db.pragma("key = ...")` from `WRITE_ROW_PROBE_SOURCE`, or ship plain better-sqlite3, and all 8 tests stay green.

**Untestable locally:** steps 1-5 need the built runtime + native addon (`node-gyp` "missing any Windows SDK", C: full). Only the Windows job covers them.

## Findings

**HIGH**

- **H1 — the unit tests never run in CI.** `package.json` `lint` ends with `… && pnpm check:sqlcipher-proof && …`, but `ci.yml:34` runs `pnpm turbo lint`, and the root package is not a turbo workspace (`pnpm-workspace.yaml:1-3` → `apps/*`, `packages/*`). `ci.yml:35-40` explicitly re-lists the root gates turbo skips — `check:sqlcipher-proof` is missing. `.scratch/implementation/410-design.md` claims the tests "run on every PR in the `lint` job". Fix: add `- run: pnpm check:sqlcipher-proof` after `ci.yml:39`.
- **H2 — assertion #2 can pass vacuously.** `:379-380` assigns and prints `probeSqlcipherBinding(...)` with no emptiness/shape check; a helper that returns `""` yields `cipher_version=` and a green step. Add at `:380`: `if (!/\d/.test(String(cipherVersion ?? ""))) throw new Error("cipher_version probe returned no version: " + JSON.stringify(cipherVersion));` plus a unit test that drives that branch.

**MEDIUM**

- **M1 — the non-empty guard has no test.** `assertEncryptedDatabase` (`:316-326`) is the enforcement point for "too small / plaintext", but it is **not exported** and untested; `test:42-55` only tests `isPlaintextSqliteFile`. Add to the test file: export the helper, then (a) 0-byte file → rejects `/too small/`, (b) 16 zero-filled bytes → currently **passes** (documented hole covered by #4/#5), (c) magic-prefixed file → rejects `/PLAINTEXT/`.
- **M2 — the backup assertion ignores the app's own definition.** `findSnapshotDatabase` (`:132-152`) only requires `YYYY-MM-DD/tuari.sqlite`; the app requires the `snapshot.json` marker (`backup.service.ts:174-195`) and records `encrypted: true` in it (`backup.service.ts:462-465`). Not satisfiable by a foreign file in a fresh temp root, but the *app's* verdict is never observed. Add at `:445`: read `path.join(path.dirname(snapshot), "snapshot.json")`, assert `app === "tuari" && format === 1 && encrypted === true`.
- **M3 — the live-DB check is `n > 0`.** `:435` passes on any one table; a half-migrated keyed DB passes. Add a known migrated table or `PRAGMA user_version > 0`.

**LOW**

- L1 — `waitForHealth`/`waitForSnapshot` timeout branches (`:294-312`) and `--keep` cleanup are integration-only; acceptable.
- L2 — `ci.yml:391` skips the job on fork PRs (`head.repo.full_name == github.repository`); consistent with the other jobs, but release coverage depends on in-repo branches plus `workflow_dispatch` (`ci.yml:130-136`, which forces `encryption=true`).

## Next

Add `- run: pnpm check:sqlcipher-proof` to the `lint` steps at `.github/workflows/ci.yml:39` — ~2 minutes, and it is the only thing making the 8 tests exist in CI at all.