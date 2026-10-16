# Code review — #402 SQLCipher build/runtime gate

- issue: #402 — *build-sidecar silently ships without SQLCipher while APP_DB_KEY
  is set (encrypted_db licenses get a plain DB)*
- tier: High-assurance (crypto / licensing)
- mode: remote
- branch: `fix/402-encryption-fallback`
- base: `ec369a303301fb61259a61c532753fea723d75fd`
- reviewed HEAD: `4444ca133d0857e7a63e2ab1e2290251d0dd35b7`
- delta under review: `2201983c..4444ca13`
- skill: `code-review` (Spec + Standards), fresh context

## Spec verdict — PASS

| Requirement | Evidence | Status |
| --- | --- | --- |
| The build never exits 0 with an `encrypted_db` license and no SQLCipher | `build-sidecar.mjs` `enforceSqlcipherGate` throws; it runs inside the build callback before `buildProbeAndPublishRuntime` swaps staging into `src-tauri/bin` | Met |
| A release build can never waive SQLCipher | `sqlcipherPlaintextWaiver({plaintextAllowed, release})` is the one rule, used by `sqlcipherGateDecision`, `resolveSqlcipher`, and `probeStagedRuntime`; matrix pinned by tests | Met |
| Refuse at runtime rather than claim encryption | `assertBindingEncrypts` requires a non-empty `PRAGMA cipher_version` and closes the handle; `assertDatabaseFileMatchesKey` checks both header directions plus truncated files | Met |
| The backup path may not claim `encrypted: true` without a proven binding | The worker's `applyKey` probes `cipher_version` on both connections before writing; the marker is only posted after the probe | Met |
| The probe has a bound | `SQLCIPHER_PROBE_TIMEOUT_MS = 30_000`, asserted in the probe test | Met |

Findings: none above Low. The delta hardens tests only; the production surface is
unchanged by it.

## Standards verdict — PASS

| Sev | Location | Claim | Disposition |
| --- | --- | --- | --- |
| Low | `backup.snapshot.test.ts:38-39` | The fake driver honours `simple` only for `cipher_version`; `user_version` returns a scalar unconditionally. The worker's `Number(schemaVersion) \|\| 0` makes that shape-insensitive, so the call is unpinned but not wrong. | Note, no action. |
| Low | `apps/api/tsup.config.ts:16` | The comment cites `resolveDriverModule` after the rename. The name still resolves to the option in `backup.snapshot.ts`, so the citation is imprecise rather than broken. | Dismissed for this PR. |
| — | branch hygiene | Delta file set is source/test/evidence only; no generated artifacts; explicit staging; the design record is committed per the scratch lifecycle. | Conforms. |
| — | `backup.snapshot.test.ts:169-199` | Design Round-5 claim "the accepted-path test fails if the probe drops `{ simple: true }`" | Verified: the fake returns an array unless `simple`, the worker then sees a non-string and throws, and `resolves` fails. |

## Bottom line

Both axes PASS. The only residual risks are the documented deferrals: #410 must
build the fork, run `backup.encrypted.test.ts` for real, and set
`TUARI_REQUIRE_SQLCIPHER=1`; `portable:only` still needs a plaintext-runtime
detector; the `build-sidecar.mjs` wiring is inspection-only.
