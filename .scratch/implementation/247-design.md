# 247 — RPC wire tests: cover getRecoveryKeyPool / generateRecoveryKeys passthrough

## Context

Coverage gap found while closing #221 (recovery-key schema hygiene). The
recovery-key SERVICE logic is unit-tested (`recovery-key.service.test.ts`) and
E2E-tested (`recovery-key.e2e.test.ts` + `tests/e2e/recovery-keys.spec.ts`),
but the thin ORPC handler passthroughs `getRecoveryKeyPool` and
`generateRecoveryKeys` in `apps/api/src/rpc/handlers/system.ts` have no
wire-level test in `apps/api/src/rpc/router.test.ts`. Only
`consumeRecoveryKey` / `revokeRecoveryKey` / `changeDbEncryptionKey` are
exercised at the wire.

## Public surface under test

Both procedures live in `systemContract` (packages/contracts/src/system-contract.ts)
and are implemented in `apps/api/src/rpc/handlers/system.ts`:

| Procedure | Handler | Output schema |
|---|---|---|
| `getRecoveryKeyPool` (query, auth) | `recoveryKeyService.getPoolStatus()` | `recoveryKeyPoolStatusSchema` |
| `generateRecoveryKeys` (mutation, audit) | `{ keys: await recoveryKeyService.generateKeys() }` | `generatedRecoveryKeysSchema` |

Service shapes (apps/api/src/modules/auth/recovery-key.service.ts):

- `RecoveryKeyPoolStatus`: `{ availableCount, totalCount, maxPoolSize, maskedKeys: [{ id, prefix, status }] }`
- `GeneratedRecoveryKey`: `{ key, prefix, createdAt }`

Wire schemas (packages/contracts/src/security.ts):

- `recoveryKeyPoolStatusSchema`: `availableCount`/`totalCount` int nonneg,
  `maxPoolSize` int positive, `maskedKeys[]` with `prefix` `.length(4)` and
  `status` enum AVAILABLE|CONSUMED|REVOKED.
- `generatedRecoveryKeysSchema`: `keys[]` with `key` string, `prefix`
  `.length(4)`, `createdAt` string.

## Approach

Build the **real** `RecoveryKeyService` on top of a stubbed `RecoveryKeyPort`
(the issue's "stubbed RecoveryKeyPort-backed service") and inject it via the
router-test harness's `recoveryKeyService` param. This validates the actual
service output flowing through the ORPC output schema — catching future drift
between the service types and the contract schemas, which a plain stub-service
object would miss.

- Stub port: in-memory records for `listAllKeys` (mixed statuses) for the pool
  test; a `withTransaction` that runs the callback with the same port +
  `countAvailableKeys` + collecting `insertKey` for the generate test.
- Assert exact passthrough shape for `getRecoveryKeyPool` and the generated
  key format (`/^[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}$/`, 4-char prefix,
  non-empty createdAt) + length 3 (INITIAL_KEY_COUNT) for `generateRecoveryKeys`.
- Auth context: `createContext()` (current user) — both procedures are
  auth-gated; the mutation also runs the audit middleware.

## Planned tests

Unit (vitest, `apps/api/src/rpc/router.test.ts`):
1. `getRecoveryKeyPool` passthrough — stub port returns mixed-status records;
   client call resolves the exact `recoveryKeyPoolStatusSchema` shape and
   `listAllKeys` was called.
2. `generateRecoveryKeys` passthrough — stub port reports 0 available; client
   call resolves `{ keys: [...] }` (3 generated, format-pinned) and
   `insertKey` was called 3×.

No Playwright E2E needed: `tests/e2e/recovery-keys.spec.ts` already drives the
real Settings flow end-to-end; this issue is strictly the missing wire-level
unit coverage.

## Risks / notes

- The router test file is `@ts-nocheck` by design (untyped client proxy), so
  the new code must match the file's existing conventions (no explicit types
  on the stub).
- `createAlgeriaTimestamp` yields `+01:00` ISO strings — assert `any(String)`
  for `createdAt`, not a fixed value.
- Output validation strips unknown keys (schemas are not `.strict()`), so a
  too-loose stub could silently pass; the exact `toEqual` for the pool status
  pins the full shape.
