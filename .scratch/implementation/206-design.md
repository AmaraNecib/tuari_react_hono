# Issue 206 — Export security/reports contract schemas so handler inputs derive

**Tier**: Standard (code / API types, no authz or security behavior changes)

**Base**: `origin/develop` @ `80d4926f029c3facee7dd17eb28da174c6e01f3b`

## Problem

`apps/api/src/rpc/handlers/handler-inputs.ts` hand-mirrors four input shapes
because the underlying Zod schemas are not exported from `@tuari/contracts`:

| Handler type | Schema | Blocked by |
|---|---|---|
| `ConsumeRecoveryKeyInput` | `consumeRecoveryKeyInputSchema` (security.ts) | `security` module not re-exported from package index |
| `RevokeRecoveryKeyInput` | `revokeRecoveryKeyInputSchema` (security.ts) | same |
| `ChangeDbKeyInput` | `changeDbKeyInputSchema` (security.ts) | same |
| `ReportFilterInput` | `reportFilterInputSchema` (reports-contract.ts) | private const, not exported |

Hand-written mirrors can drift from the wire contract. The file already derives
every other shared input via `z.infer<typeof schema>` — these four are the
exceptions.

## Public API changes

1. `packages/contracts/src/index.ts` — add `export * from "./security";`
   - No export-name collisions: verified by grep — the `security.ts` names are
     only referenced by `system-contract.ts` (which imports them from
     `./security` directly) and no other contracts module exports the same names.
2. `packages/contracts/src/reports-contract.ts` — make `reportFilterInputSchema`
   an `export const` (name is unique in the package).
2b. `packages/contracts/src/index.ts` — also add `export * from "./reports-contract";`
   (found during implementation: `reports-contract.ts` was imported only by
   `app-contract.ts` and never re-exported from the index, so the exported const
   would still be unreachable from `@tuari/contracts`. This matches the existing
   pattern — `invoice-contract`, `payment-contract`, `update-contract`,
   `rbac-contract` are already re-exported wholesale; `reportsContract` name is
   unique, no collisions).
3. `apps/api/src/rpc/handlers/handler-inputs.ts` — replace the four mirrored
   aliases with `z.infer<typeof ...>` from the contract schemas; drop the now
   unused `ReportType` import.

No runtime behavior change: `exactOptionalPropertyTypes` is not enabled, so the
inferred `ReportFilterInput` (`startDate?: string | undefined`) is structurally
identical to the mirror (`startDate?: string`).

## Dependencies

None new. `security.ts` and `reports-contract.ts` only depend on `zod`, which
the contracts tsup build already externalizes (`--external zod`). No TS4058
risk (no `rawDb` param typing involved; all annotated exports).

## Planned tests

Unit (vitest):
- `packages/contracts/src/index.test.ts` — new block asserting the four schemas
  are reachable from the package index and validate/reject:
  - `consumeRecoveryKeyInputSchema` / `revokeRecoveryKeyInputSchema` —
    accept non-empty, reject empty strings.
  - `changeDbKeyInputSchema` — accepts `{ currentKey, newKey }`; rejects short
    `newKey` (< 8) and empty `currentKey`.
  - `reportFilterInputSchema` — accepts type-only and with ISO datetime offsets;
    rejects unknown type and non-datetime date strings.
- `apps/api/src/rpc/router.test.ts` — black-box ORPC client runtime tests of the
  contract → handler path for the derived inputs:
  - `consumeRecoveryKey` / `revokeRecoveryKey` with a minimal stub
    `recoveryKeyService` (the harness currently passes `{} as never`).
  - `changeDbEncryptionKey` with the existing `{} as never` `rawDatabase` —
    the try/catch returns `{ success: false, error: "Current encryption key is invalid" }`.
  - `reportsGenerate` with `{ type: "INVENTORY" }` — works with the existing
    stub `inventoryService` (optional-chaining short-circuits).
  - One invalid-input rejection (e.g. `reportsGenerate` with `type: "BOGUS"` /
    empty `key`) proving the ORPC wire validation gates the same schema that now
    derives the handler type.

Type-level: `pnpm typecheck` (api + contracts) is the compile-time proof that
the derived types never drift.

Playwright E2E: **none added — documented deviation.** This is a type-only
refactor with zero runtime delta. The affected user-facing flows (recovery-key
management, report generation) have no wired UI today — `SecuritySection`
(`apps/web/src/features/app-shell/security-section.tsx`) is defined but never
mounted, and no web code calls the recovery-key procedures. An E2E would test
service/DB behavior, not this change. Runtime coverage is instead provided by
the router-level ORPC tests above.

## Implementation risks

- Low. Pure additive exports + type alias replacement.
- Found: `reports-contract.ts` was not re-exported from the package index at all
  (see step 2b) — the issue's stated fix (export the const) was insufficient
  without the index re-export.
- Watch: contracts tsup `--dts` build (wisdom: TS4058 only affects inferred
  returns naming external types — not applicable here, but the package build is
  run to confirm).
- Watch: the router test file is `@ts-nocheck`/untyped by design; keep new
  tests in the same style (no type-checking expected there).
