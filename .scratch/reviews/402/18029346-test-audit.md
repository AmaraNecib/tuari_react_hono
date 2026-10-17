# Test audit — #402 SQLCipher build/runtime gate (post-rebase)

- issue: #402
- tier: High-assurance (crypto / licensing)
- mode: remote
- branch: `fix/402-encryption-fallback`
- base: `ee366d0d` (current origin/develop)
- reviewed HEAD: `18029346310a4cda7ba24cf4625fcbcb1226b8ca`
- skill: `test-audit`, fresh context

## Verdict

**PASS. The rebase preserved coverage and the revert detectors; no blocker.**

## Byte-identity of the tested code

Every #402 test and source file has the same blob at `18029346` as at `4444ca13`:

| File | Same blob |
| --- | --- |
| `apps/api/src/infrastructure/database/factory.test.ts` | yes |
| `apps/api/src/modules/backup/backup.snapshot.test.ts` | yes |
| `apps/api/src/modules/backup/backup.encrypted.test.ts` | yes |
| `apps/api/src/modules/backup/backup.service.test.ts` | yes |
| `apps/desktop/scripts/runtime-staging.test.mjs` | yes |
| `apps/desktop/scripts/sqlcipher-availability.test.mjs` | yes |
| `factory.ts`, `backup.snapshot.ts`, `build-sidecar.mjs`, `runtime-staging.mjs`, `sqlcipher-availability.mjs` | yes |

So the two round-5 revert detectors are bit-for-bit the reviewed ones: the fake
driver honours `{ simple: true }`, and the specifier assertion runs
synchronously. A restricted diff over those paths between `4444ca13` and
`18029346` is empty; the unrestricted `-- apps/` diff shows only develop's own
content arriving through the new base.

## Commands run

| Command (cwd) | Result |
| --- | --- |
| `npx vitest run src/infrastructure/database/factory.test.ts src/modules/backup/backup.snapshot.test.ts src/modules/backup/backup.encrypted.test.ts` (apps/api) | 2 passed / 1 skipped; 27 passed / 3 skipped |
| `node --test ./scripts/*.test.mjs` (apps/desktop) | 59 tests, 58 pass, 0 fail, 1 skipped |

The skips are the documented ones: `backup.encrypted.test.ts` (no native fork on
this host) and the `TUARI_REQUIRE_SQLCIPHER=1` sentinel. No new silent skip.

## Remaining documented gaps (unchanged)

1. #410 keyed-write proof — deferred by design.
2. The sentinel is unarmed until #410 sets `TUARI_REQUIRE_SQLCIPHER=1`.
3. `build-sidecar.mjs` waiver wiring is inspection-only.
4. `portable:only` escape hatch — owner decision outstanding.
5. `APP_DB_KEY=""` and the `readSync` failure path.
