# #402 integration on merged develop

- Issue: #402, fail closed when a configured database key cannot be honored.
- PR: #496, `fix/402-encryption-fallback`.
- Worktree: `D:/worktrees/tuari_react_hono/t3-79bcbc12`.
- Branch: `fix/496-develop-integration`.
- Starting commit: `2c0ff0e542d2535f32e4b8d24336c1060c019420`.
- Develop: `origin/develop` at `6ba4146475ad3391b4f9f0007d043907a6cb93fe`, squash merge of #504.
- Preserved #496 head: `b4216812bfeb3c0c5858eb9aa6b7e8ba1ba02753`, descendant of published #496 `5f31a5ec470e4be1cbbac76443271bd38d883797`.
- Verification mode: focused-local / CI-final-pending. Protection was last unconfigured. This work does not claim enforcement or merge readiness.
- Risk: high assurance. The changed path packages a native encryption runtime and prevents a keyed database from opening through a non-encrypting driver.

## Current contract

`encrypted_db` licenses require SQLCipher-backed storage. Packaging must fail closed if the shipped native binding is unavailable. API and backup connections must apply the maintained `better-sqlite3-multiple-ciphers` configuration (`cipher='sqlcipher'`, then `legacy=4`, then the escaped key). No fallback may accept plaintext or claim an encrypted backup without evidence.

Develop's #504 port is authoritative for the driver, prebuild-only packaging, auth schema, dependency upgrades, SQLCipher legacy4 fixture/tests and CI gates. This integration keeps that source. It does not revive the older `better-sqlite3-sqlcipher` dependency, native-build fallback, `cipher_compatibility=4`, obsolete docs, or older workflow policy from the preserved branch.

## #496 changes retained

- The preserved head adds destination-scoped cross-process serialization for runtime recovery and publication. The lock spans recovery, the directory swap, rollback, and stale-backup cleanup. A publisher that cannot prove it owns the lock fails closed.
- The `runtime-staging.mjs` helper and its concurrency/failure tests are retained. `build-sidecar.mjs` builds into an isolated sibling staging tree, checks the staged SQLCipher prebuild, then publishes the complete `bin` tree through that helper. A failed build or probe must leave the previous runtime intact. `.gitignore` excludes staging, backup and lock artifacts.
- The encrypted backup snapshot test now checks the ciphertext bytes before and after a missing-key open attempt. It must fail without the key, and the failed attempt must not alter the file.
- The Windows `cmd.exe` path handling correction from #402 remains part of the preserved branch ancestry; current security script behavior is retained.

## Integration resolutions

1. Merged `origin/develop` into the integration branch before merging the preserved #496 head. The develop merge had the same source tree as the supplied parent commit, so it records ancestry without replacing current source.
2. Merged the preserved head with an ours-tree ancestry merge to avoid bringing back hundreds of tracked historical reports, stale workflow instructions, and superseded #504 source. Only the runtime-staging implementation/tests and the missing-key byte-preservation assertion are ported into the current tree.
3. Kept #504's `better-sqlite3-multiple-ciphers` driver and SQLCipher `legacy=4` settings. The preserved branch's older driver/factory, `cipher_compatibility=4`, node-gyp build path and dependency changes are not applied.
4. Kept #504's fail-closed, prebuild-only packaging and current CI, auth-schema and dependency changes. The old #496 packaging script was not copied wholesale because it predates those contracts.
5. Historical `.scratch/reviews/` reports are not restored as tracked files. Prior claims in those reports are not evidence for this integration. Independent review must inspect this integration head and carry forward only conclusions it verifies.

## Interfaces and proof boundary

`buildProbeAndPublishRuntime` owns the publication lifecycle. Its inputs are staging and destination paths plus build/probe callbacks. The build and probe run before lock acquisition; the lock then protects recovery, swap, rollback and stale backup cleanup. This keeps package-specific build policy in `build-sidecar.mjs` while the filesystem transaction stays testable through the helper. The API factory and snapshot worker retain the single maintained driver configuration already present on develop.

Focused proof must cover runtime-staging ordering, competing publishers, stale-lock recovery, failed build/probe preservation, the factory's keyed path, encrypted backup read/write behavior, missing-key byte preservation, and packaging/security script tests. The real packaged runtime acceptance remains separate from a successful local prebuild check.

## Verification record

- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0, 29.87 s. No package manifest or lockfile changed. Native install scripts remained disabled.
- `pnpm --filter @tuari/desktop run test:packaging-security`: exit 0, 41 tests, 40 passed, 1 skipped, 0 failed, 2.58 s. This includes the Windows command-path check and runtime publish concurrency/failure tests.
- `pnpm --filter @tuari/api exec vitest run src/infrastructure/database/factory.encryption.test.ts src/modules/backup/backup.snapshot.test.ts src/modules/backup/backup.encrypted.test.ts`: exit 1, 9 tests failed because this isolated worktree has no built `better-sqlite3` native binary. Failure is environmental at module load, before SQLCipher or backup assertions. The attempt is preserved in `.scratch/reviews/402/postinstall-api-encryption.log`.
- Initial API test attempt before frozen install: exit 1 because `vitest` was not installed. Preserved at `.scratch/reviews/402/phase1-api-encryption.log`.
- `pnpm --filter @tuari/desktop exec eslint ...`: exit 1 because ESLint is not installed as a desktop dependency. No result claimed; preserved at `.scratch/reviews/402/static-desktop-eslint.log`.
- API focused ESLint and typecheck did not run because the verification script stopped at the missing desktop ESLint executable. No successful typecheck is claimed.
- Final source fingerprint and committed-head checks must be written after the integration commit. Full suites, native build/artifact checks and hosted CI are not run locally.

## Open acceptance limits

- The owner-only literal nonempty `PRAGMA cipher_version` acceptance criterion remains unmet. Do not waive it or substitute `PRAGMA cipher`.
- #410's built-artifact keyed-write/ciphertext proof remains separate and must run in its intended CI environment.
- Protection is pending, so CI-final enforcement and hosted current-head verdicts remain parent gates.
- `portable:only` detection of a previously staged plaintext runtime remains a separate gap unless current source already closes it. Do not claim release acceptance from the local runtime-staging tests.

## Review boundary

The preserved #496 history had reviews attached to earlier, incompatible SQLCipher driver assumptions. The former author said the head was reviewed, but that claim is unverified. The current reviewers should size a fresh combined-delta review around the #504-to-#496 integration, particularly the runtime publication lock, staged-tree lifecycle, preserved-byte failure case and the current SQLCipher configuration. Parent owns debate, test-audit and code-review.
