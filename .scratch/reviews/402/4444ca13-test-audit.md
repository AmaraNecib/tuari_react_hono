# Test audit — #402 SQLCipher build/runtime gate

- issue: #402
- tier: High-assurance (crypto / licensing)
- mode: remote
- branch: `fix/402-encryption-fallback`
- base: `ec369a303301fb61259a61c532753fea723d75fd`
- reviewed HEAD: `4444ca133d0857e7a63e2ab1e2290251d0dd35b7`
- delta under audit: `2201983c..4444ca13`
- skill: `test-audit` (edge cases, coverage, quality), fresh context

## Commands run

| Command (cwd) | Result |
| --- | --- |
| `npx vitest run src/modules/backup/backup.snapshot.test.ts src/infrastructure/database/factory.test.ts` (apps/api) | 2 files, 27 tests, 0 fail |
| `node --test ./scripts/sqlcipher-availability.test.mjs` (apps/desktop) | 21 tests, 0 fail, 0 skip |

## Revert-detector table

| Mutation | Detector | Proven how |
| --- | --- | --- |
| Worker probe drops `{ simple: true }` (`backup.snapshot.ts:41`) | Accepted-path test (`backup.snapshot.test.ts`, "does not refuse a binding that reports a cipher version") | Ran the real worker body with the fake: original resolves `{schemaVersion:0, encrypted:true}`; mutant posts `ok:false` `/no cipher_version/` → `resolves` fails |
| Worker probe deleted entirely | Accepted-path test | Without the probe the worker resolves; the refusal assertion fails |
| Probe inverted / empty-check removed | Refusal test ("refuses a keyed snapshot when the binding reports no cipher_version") | Fake returns `""` with `simple: true` → would resolve instead of reject |
| Keyed path resolves `better-sqlite3` (ternary swapped) | Specifier `expect(...)` in both keyed tests | Called synchronously at creation, so the throw fails the test body |
| Delete the `cipher_version` check in `applyKey` | Refusal test | Reverted worker posts `{ok:true, encrypted:true}`, so `rejects.toThrow` fails |
| Delete `assertBindingEncrypts` from the keyed branch | `factory.test.ts` "refuses to open a keyed workspace on a non-encrypting binding" + the `plain.open === false` assertion | Plain better-sqlite3 reports no cipher version; the probe throws and closes |
| Delete the `assertDatabaseFileMatchesKey` call in `createDatabaseConnection` | `factory.test.ts` "refuses a plaintext file on the wired keyed path" | The tracking constructor records `constructed = true`, and the test asserts it stays false |
| Revert the two-way header rule | `factory.test.ts` keyed-plaintext and keyed-truncated tests | The regexes only match the new branches |
| Revert the release waiver | `sqlcipher-availability.test.mjs` release tests | `refuse-release` and `sqlcipherPlaintextWaiver` matrices |
| Revert the probe timeout | `sqlcipher-availability.test.mjs` probe test | Asserts `calls[0].options.timeout === SQLCIPHER_PROBE_TIMEOUT_MS` |

## Verdict

**PASS.** All three suites are green, and every behaviour this branch added has a
test that fails when the behaviour is removed. The round-3 gap — the backup
worker's probe had no executed test on any host — is closed by driving the real
worker through the `resolveDriverModule` seam.

## Remaining gaps (documented, none silent)

1. **#410 native job** — real encryption (keyed write, reopen, wrong-key refusal)
   plus the `TUARI_REQUIRE_SQLCIPHER=1` sentinel, which no workflow sets yet.
2. **`build-sidecar.mjs` wiring** — `sqlcipherPlaintextWaiver` call sites are
   inspection-only because the script runs at import.
3. **`portable:only` and `APP_DB_KEY=""`** — recorded deferrals.
4. Low: the keyless specifier string `"better-sqlite3"` is not asserted (the
   keyless path is exercised end to end by five tests).
