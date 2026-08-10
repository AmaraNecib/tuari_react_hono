# Issue 228 — Recovery-key e2e "simulated password change" test is a no-op

## Problem

`apps/api/src/modules/auth/recovery-key.e2e.test.ts` contains:

1. `"recovery keys survive simulated password change"` — the "password change"
   is only a comment. No `PRAGMA rekey` / `changeDatabaseKey` is exercised;
   the test only proves sequential consumption of all generated keys.
2. `"full lifecycle: generate → revoke → use → change password"` — the title
   also ends in "change password", but the test never changes a password
   (it ends with replenish + consume new keys).

## Decision: rename to what the tests actually assert (acceptance option 2)

The issue offers two acceptable outcomes:
1. Exercise a real rekey-equivalent DB operation, **or**
2. Rename the test to what it actually asserts.

We pick **option 2**. Why option 1 is not viable in this workspace:

- `PRAGMA rekey` / `PRAGMA key` are SQLCipher features. The workspace does not
  build `better-sqlite3-sqlcipher`: pnpm 10 `onlyBuiltDependencies` in
  `pnpm-workspace.yaml` lists only `better-sqlite3` and `prisma`; CI runs
  `pnpm install --frozen-lockfile`, so the binding never compiles there either.
  The package ships no prebuilds — it needs a node-gyp source build.
- Calling `DatabaseKeyManager.changeKey` against plain better-sqlite3 is a
  **documented no-op** (`database-key-manager.test.ts`: "On plain
  better-sqlite3 the SQLCipher PRAGMAs are no-ops, so the verification read
  succeeds and the manager reports success"). Exercising it in the e2e would
  recreate exactly the "simulation" the issue flags.
- Enabling SQLCipher builds is a workspace-wide config change (CI compile time
  + toolchain risk on every future PR) — disproportionate to a test-title
  issue.

## Changes

- Rename `"recovery keys survive simulated password change"` →
  `"every generated key is sequentially consumable (pool drains to zero)"`
  — exactly what the assertions prove.
- Rename `"full lifecycle: generate → revoke → use → change password"` →
  `"full lifecycle: generate → revoke → use → replenish"` — the actual
  last step.
- Update the file's module doc comment: drop the "Password change is
  simulated" claim; state the real coverage boundary (recovery keys are
  app-layer, DB rekey is covered at the unit level by
  `database-key-manager.test.ts` and is not exercisable in this workspace).
- Drop the misleading inline "Simulate password change" comment.

## Tests

- Existing assertions are unchanged — they already match the new titles.
- No new unit/E2E tests required (pure test-honesty fix; no production code).

## Risks

- None for production (no production code touched).
- `pnpm test:api` must stay green.
