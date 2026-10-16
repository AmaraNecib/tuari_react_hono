# Debate — #402 SQLCipher build/runtime gate

- issue: #402
- tier: High-assurance (crypto / licensing)
- mode: remote
- branch: `fix/402-encryption-fallback`
- base: `ec369a303301fb61259a61c532753fea723d75fd`
- reviewed HEAD: `4444ca133d0857e7a63e2ab1e2290251d0dd35b7`
- method: critic and defender in fresh, separate contexts; synthesised here
- delta under scrutiny: `2201983c..4444ca13`

## Synthesised verdict

**No blocker. The branch meets #402's acceptance criteria.** The build fails
(never warns and exits 0) when SQLCipher cannot be produced, a release build can
never waive, and the runtime refuses an encrypted claim it cannot substantiate.
The round-5 delta turns two tests into real revert detectors. The remaining
weakness is not a code defect: the end-to-end keyed-write proof is deferred to
#410 by design, and its sentinel is unarmed until that job exists.

## Critic case

### Round-5 changes confirmed genuine

1. **Fake driver honours the pragma contract.** `backup.snapshot.test.ts:32-36`
   returns a row array unless `{ simple: true }` is passed. Mutation: delete
   `{ simple: true }` from the worker probe (`backup.snapshot.ts:41`) → the fake
   yields `[{ cipher_version: "4.5.6 community" }]` → `typeof !== "string"` →
   worker posts `ok:false` → the `.resolves` test fails. The refused-path test
   alone could not catch this; the accepted-path test can.
2. **Specifier assertion is real.** `expect(specifier).toBe("better-sqlite3-sqlcipher")`
   runs synchronously inside `createWorkerSnapshotter`, before any `await`, so a
   swapped keyed driver throws an `AssertionError` and fails the test.
3. **Rename removes the option/implementation name collision.**

### Open objections at this HEAD

1. **Unarmed sentinel.** `backup.encrypted.test.ts:180` uses
   `it.runIf(process.env.TUARI_REQUIRE_SQLCIPHER === "1")`, and nothing in
   `.github/workflows/` sets it. The skip is no longer silent *if someone sets
   the var*; no pipeline does yet.
2. **#410 keyed-write proof.** `describe.skipIf(Sqlcipher === null)` still skips
   on this host (no native fork). The probe proves the binding *reports* a
   cipher version, not that a keyed write lands ciphertext.
3. **`build-sidecar.mjs` wiring.** The `sqlcipherPlaintextWaiver` call sites run
   at import and are inspection-only; no test imports the script.
4. **`portable:only`.** The low-level escape hatch can zip a `bin/` a human
   previously built with the waiver; the release path always re-runs the strict
   gate. Owner decision outstanding.

Strongest remaining objection: **#402's headline guarantee has no executing
proof in current CI** — the native test skips and the sentinel that would fail
instead never fires. Recorded as #410, not hidden.

## Defender case

1. **The original defect is closed at its source.** `enforceSqlcipherGate()` runs
   inside the build callback before `buildRuntime()` writes anything, and
   `buildProbeAndPublishRuntime` only swaps staging into `src-tauri/bin` after
   the gate and probe pass; a refusal throws.
2. **The waiver is one definition.** `sqlcipherPlaintextWaiver({plaintextAllowed, release})`
   is used by `sqlcipherGateDecision`, `resolveSqlcipher`, and
   `probeStagedRuntime`; `isReleaseBuild` forces `refuse-release` however the
   waiver was requested.
3. **Defence in depth is genuine.** `resolveDatabaseConstructor` throws when the
   fork cannot load; `assertBindingEncrypts` requires a non-empty
   `PRAGMA cipher_version` and closes the handle; the backup worker runs the same
   probe before it may report `encrypted: true`.
4. **The header rule covers both directions** plus truncated files, and a
   fresh/empty workspace still opens.
5. **Escaping is single-sourced** (`escapeSqliteString`) across the API
   connection, the backup worker's key, and `VACUUM INTO`.

### Unanswerable objections (stated plainly)

- A binding that lies (returns a cipher version but writes plaintext) passes
  every gate; only a keyed-write-and-inspect job catches it (#410).
- `portable:only` is bounded but not closed.
- `build-sidecar.mjs` wiring is proven by reading, not by a test.
- `APP_DB_KEY=""` and the `readSync` failure path stay deferred.
