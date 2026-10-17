# Test audit — #410 encryption proof @ 8e729c4d (base d6164c65)

**Verdict:** the unit suite is honest about what it covers, and all five earlier findings are addressed — but the suite **cannot fail if the encryption guarantee is deleted**. `node --test tests/sqlcipher-encryption-proof.test.mjs` = **11 tests, 11 pass, 0 fail, 1.16s** (ran locally). The only assertion that notices a removed `db.pragma("key = …")` is `assertEncryptedDatabase(roundTripDb, "keyed write")` inside `runProof`, which runs **only on the Windows runner**. Adding one structural unit test closes that hole; see MEDIUM-1.

Not verified here (no Windows SDK, no release artifact): steps 1–5 of the spec never executed on this workstation. `node-gyp` cannot configure, so the CI job is the sole execution path. Everything below about the probe sources is static reading.

## Assertion → enforcement → vacuous risk

| Spec assertion | Enforced by (file:line) | Fails if the guarantee is removed? | Vacuous risk |
| --- | --- | --- | --- |
| 1. Runtime holds a loadable SQLCipher binding | preflight `requiredRuntimeFiles` (`sqlcipher-encryption-proof.mjs:105`) + `inspectSqlcipherArtifact` (`sqlcipher-availability.mjs:39`) | Yes — missing package dir/files go red with the "not built with the real SQLCipher dependency" hint | **SHALLOW**: existence of `build/better_sqlite3.node` + `libeay32.dll` only. A stub addon, or a plain build copied into that layout, passes step 1. Caught by step 2, not by step 1. |
| 2. `PRAGMA cipher_version` non-empty | `SQLCIPHER_PROBE_SOURCE` exits 3 on empty (`sqlcipher-availability.mjs:157-160`) + wrapper throw (`:196-201`); unit-tested at `sqlcipher-availability.test.mjs:149`, `:222` | Yes — plain better-sqlite3 returns `undefined`, probe exits 3, wrapper throws "reported no cipher_version" | **LOW**: not vacuous on emptiness any more (H2 fixed). A non-empty but bogus string still passes — no format/shape check on the value. |
| 3. Keyed write leaves a NON-plaintext file | `assertEncryptedDatabase(roundTripDb, "keyed write")` in `runProof` (`:360`) — **CI only** | Yes, and it is the **only** net for a deleted key pragma (see below) | **LOW**: the predicate is "not the 16-byte magic", so arbitrary non-SQLite bytes pass; step 4's keyed read-back then fails. |
| 4. Reopen WITH the key reads the row | exact `readBack.length !== 1 \|\| readBack[0].marker !== marker` (`:372`) — CI only | Yes — a wrong/absent key gives 0 rows or the wrong marker | **LOW**: `\|\| "[]"` on empty stdout still fails the length check. |
| 5. Shipped runtime boots keyed; live DB non-plaintext, ≥1 table, key-readable | `assertEncryptedDatabase(liveDb, "sidecar database")` (`:404`) + `keyedTableNames` (`:412`) — CI only | Yes | **LOW**: a keyless sidecar writes a plaintext file → red. Also red if the sidecar ignored `APP_DB_PATH`. |
| 6. Daily backup non-plaintext, marked, tables == live | `findSnapshotDatabase` requires `snapshot.json` (`:135`) + `assertEncryptedDatabase(snapshot, "daily backup")` (`:424`) + table-name equality (`:431`) — CI only | Yes for marker/plaintext/missing-table; **no** for missing *rows* | **MEDIUM**: equality is schema-only and the proof never puts a row in the live DB, so an empty-but-schema-complete backup passes. |
| 7. Unit tests actually run in CI | `.github/workflows/ci.yml` lint job step `pnpm check:sqlcipher-proof` (H1) | n/a | Fixed at 8e729c4d. |

### The central question, per assertion

- **Delete `db.pragma("key = …")` from `WRITE_ROW_PROBE_SOURCE`.** Step 2 is unaffected (it lives in `SQLCIPHER_PROBE_SOURCE`, a different constant). Step 3 fires: the file starts with `SQLite format 3\0` → *"keyed write: … is a PLAINTEXT database"* → exit 1. Step 4 would still pass (a plaintext DB reads fine unkeyed), step 5 is unaffected. **No unit test notices** — grep confirms `WRITE_ROW_PROBE_SOURCE` appears in zero test files, so the unit suite is green with the guarantee deleted. Exactly one assertion in the whole change catches it, and only on Windows CI.
- **Ship plain better-sqlite3 instead.** Step 1 usually fires first (the package dir is `better-sqlite3-sqlcipher`; plain better-sqlite3 is a different package and its addon lives at `build/Release/`). If the plain build is transplanted into that layout, step 2 fires: `cipher_version` is `undefined` → probe `process.exit(3)` → wrapper throws. Step 3 is an independent second net.
- **Unit-suite level:** the only unit assertions that fail when the *predicate* is neutered are the four rejection assertions in `assertEncryptedDatabase rejects a database that is missing, too small, or plaintext` — drop the size check and the empty/short assertions fail; make `isPlaintextSqliteFile` return `false` always and the plaintext assertion fails. Nothing unit-tested fails when the *binding* is fake.

## Role 1 — Edge case hunter

- **E1 (MEDIUM): the newest-invalid → older-valid fallback in `findSnapshotDatabase` is untested.** The loop `continue`s past a dated folder with no database or no marker (`sqlcipher-encryption-proof.mjs:128-139`), so a half-written *today* folder silently returns *yesterday's* backup. The existing test only asserts `null` when every folder is invalid (`tests/sqlcipher-encryption-proof.test.mjs:65-83`). A gate that quietly proves yesterday's file is the wrong failure. Add to `tests/sqlcipher-encryption-proof.test.mjs`:
  ```js
  test("findSnapshotDatabase skips an incomplete newest folder and returns the older marked one", () => {
    withTempDir((dir) => {
      const write = (name, { db = true, marker = true } = {}) => {
        mkdirSync(path.join(dir, name), { recursive: true });
        if (db) writeFileSync(path.join(dir, name, "tuari.sqlite"), Buffer.from("x"));
        if (marker) writeFileSync(path.join(dir, name, "snapshot.json"), "{}");
      };
      write("2026-03-01");
      write("2026-03-02", { marker: false }); // newest is a failed run
      assert.equal(findSnapshotDatabase(dir), path.join(dir, "2026-03-01", "tuari.sqlite"));
    });
  });
  ```
  Decide and encode the intent: either this is the wanted behaviour (test as written) or a newer incomplete run should be a hard failure (then the fallback is a bug).
- **E2 (LOW→MEDIUM): directory / unreadable paths produce bare `fs` errors.** `readFileHeader` (`:78`) throws `EISDIR` and `assertEncryptedDatabase` (`:263`) throws raw from `statSync`/`openSync` with no label, so a mis-resolved runtime path gives a stack trace instead of "expected a database at X". Not unit-tested. Add: `assert.throws(() => assertEncryptedDatabase(dir, "probe"), /probe/)`.
- **E3 (LOW): a truncated *non-empty* 16-byte file that is not the magic is accepted as encrypted.** Correct behaviour, but only the ≥2048-byte acceptance case is tested. Add a 16-byte non-magic acceptance case to pin the boundary.
- **E4 (LOW): `parseArgs` silently ignores single-dash typos and bare positionals** (`:169-172` only throws for `--`-prefixed). `parseArgs(["-runtime", "x"])` returns defaults. Unasserted.
- **E5 (LOW): `findSnapshotDatabase` on a `backupsRoot` that exists as a *file* throws `ENOTDIR`** instead of returning `null`. Unasserted.
- **E6 (MEDIUM, script-level): no data-level backup check.** The live DB is only ever written by migrations, so the table-name equality (`:431`) is a schema comparison. A `VACUUM INTO` that copied the schema and zero rows passes. Write a row into the live database before the backup (or query `SELECT count(*)`) if you want the "faithful copy" claim to mean data too.
- **Race/timeout paths** (`waitForHealth`, `waitForSnapshot`) are fail-closed and bounded — good — but only reachable on the runner; nothing here to unit-test.

## Role 2 — Coverage analyst

- **AC coverage:** AC2 is the best-covered (three tests: `sqlcipher-availability.test.mjs:106` happy path, `:133` loader stderr, `:149` and `:222` empty version). AC1/AC3/AC4/AC5 have **zero** unit coverage of the enforcement expression; they are covered exclusively by the Windows job. That is the declared design (`410-design.md` "Tests": pure helpers only, the job is the integration proof), and the wiring now actually runs the unit file (H1).
- **Diversity:** good — tempdir file fixtures, `deepEqual` on path lists, regex on error messages, injected `readdir`/`execFile`-style seams.
- **Duplicates:** `isPlaintextSqliteFile` tests vs `assertEncryptedDatabase` plaintext rejection overlap at different layers; keep both.
- **Missing, and the highest-value gap:** nothing asserts the probe sources even *contain* the key pragma. Everything else is well covered.
- **Not verified by me:** whether `check:workflow-assets` pins the new job/step names or the `encryption` detect output. I did not read the workflow-assets check.

## Role 3 — Quality reviewer

**Grade: B+**

- Names state the invariant ("a truncated or empty file is not proof of encryption", "findSnapshotDatabase ignores folders that are not snapshots") — excellent for a gate.
- Isolation is clean: `withTempDir` with `try/finally` per test, no shared state, no ordering coupling.
- All tests synchronous, so no missing-await class of bug; all assertions are specific (regex carrying the label, `deepEqual` with exact arrays).
- `withTempDir` swallows async: `return run(dir)` never awaits a promise, so a future `async` test body would silently pass the assertions after the temp dir is deleted. Add `await`/an async variant when needed; note it in a comment now.
- Minor: `assert.equal(x, true)` → `assert.ok(x)`; the per-test `write` helper is duplicated in shape between the two snapshot tests (acceptable).

## Findings

- **HIGH:** none.
- **MEDIUM-1 — the unit suite cannot detect a deleted keyed pragma.** Location: `apps/desktop/scripts/sqlcipher-encryption-proof.mjs:189-203` (`WRITE_ROW_PROBE_SOURCE`), audit surface `tests/sqlcipher-encryption-proof.test.mjs`. Fix: export the two probe source constants and add to `tests/sqlcipher-encryption-proof.test.mjs`:
  ```js
  test("the write probe actually applies the key before writing", async () => {
    const { WRITE_ROW_PROBE_SOURCE, READ_ROWS_PROBE_SOURCE } = await import(
      "../apps/desktop/scripts/sqlcipher-encryption-proof.mjs"
    );
    assert.match(WRITE_ROW_PROBE_SOURCE, /db\.pragma\(\s*"key = /);
    assert.match(WRITE_ROW_PROBE_SOURCE, /cipher_compatibility/);
    assert.match(READ_ROWS_PROBE_SOURCE, /db\.pragma\(\s*"key = /);
  });
  ```
  This is a structural guard, not proof of encryption — but it is the difference between "the unit suite notices" and "only the runner notices".
- **MEDIUM-2 — backup equality is schema-only, never data.** Location: `apps/desktop/scripts/sqlcipher-encryption-proof.mjs:425-436`. Fix: after `waitForHealth`, write a marker row through the API (or `runBundledNode` the write probe against `liveDb` with the key) and assert the backup returns it; the check cannot live in `tests/sqlcipher-encryption-proof.test.mjs` (needs the native binding), so record it in `410-design.md` as the accepted limitation if you choose not to add it.
- **MEDIUM-3 — untested newest-invalid fallback.** Add the E1 test to `tests/sqlcipher-encryption-proof.test.mjs`.
- **LOW-1 — bare `fs` errors for a directory/missing path.** Add the E2 case to `tests/sqlcipher-encryption-proof.test.mjs` (and wrap `statSync`/`openSync` failures with the label in `assertEncryptedDatabase`).
- **LOW-2 — `parseArgs` ignores single-dash typos and positionals.** Add `assert.throws(() => parseArgs(["-runtime", "x"]))` or document the leniency, in `tests/sqlcipher-encryption-proof.test.mjs`.
- **LOW-3 — 16-byte boundary acceptance unasserted.** Add the E3 case to `tests/sqlcipher-encryption-proof.test.mjs`.

## Re-verification of the 9e94d1fe round

- **H1 — unit tests never ran in CI: FIXED.** `.github/workflows/ci.yml` lint job now has `- run: pnpm check:sqlcipher-proof` (diff line +41), alongside `check:e2e-selection`/`check:license-signer`; root `package.json:13` defines the script against `./tests/sqlcipher-encryption-proof.test.mjs`. It is an explicit job step, so `pnpm turbo lint` missing the root package is no longer the hole.
- **H2 — `cipher_version` could pass vacuously: FIXED.** `SQLCIPHER_PROBE_SOURCE` (`sqlcipher-availability.mjs:151-163`) exits 3 when the version is not a non-empty string, and `probeSqlcipherBinding` (`:194-201`) independently throws `SQLCipher binding loaded … but reported no cipher_version; it cannot encrypt.` Two unit tests cover it: `sqlcipher-availability.test.mjs:149` (clean exit, empty stdout) and `:222` (synthetic binding returning `""`). The wrapper's own guard is what makes it non-vacuous even if the injected `execFile` is a stub.
- **M1 — `assertEncryptedDatabase` unexported and untested: FIXED.** Exported (`:262`), and `tests/sqlcipher-encryption-proof.test.mjs:88-107` covers all three rejection paths (missing / 0 bytes / 8 bytes / plaintext) plus the acceptance path. The 0-byte and 8-byte cases are exactly the empty/truncated requirement.
- **M2 — backup assertion ignored `snapshot.json`: PARTLY FIXED, deliberately.** `findSnapshotDatabase` now requires `BACKUP_MARKER_FILE_NAME` (`:135`) and `tests/sqlcipher-encryption-proof.test.mjs:65-83` asserts a dated folder with `tuari.sqlite` but no marker returns `null`. The marker's *contents* are still not asserted — the commit dismisses this with a citation: `backup.service.ts` writes `encrypted: Boolean(databaseKey)`, an echo of config, not a verification, and the proof verifies the actual file bytes instead. I accept that reasoning: presence-required + bytes-asserted is strictly stronger than parsing an echoed flag. No action.
- **M3 — live-database check was only "at least one table": FIXED.** `runProof` still rejects an empty live schema (`:415-417`), but it now additionally compares the backup's table list to the live database's (`:431-435`), throwing "the daily backup is not a faithful copy". A readable-but-incomplete backup with different tables fails. Residual: rows, not tables (MEDIUM-2).
