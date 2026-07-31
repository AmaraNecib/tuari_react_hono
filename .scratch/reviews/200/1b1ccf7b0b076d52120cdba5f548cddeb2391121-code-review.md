# Code Review — issue #200

**Tier:** Standard
**Fixed point:** `d41e3e8d3d6a5d88614a1edf3e6afbfb30bda64f` (origin/develop merge-base)
**Head SHA:** `1b1ccf7b0b076d52120cdba5f548cddeb2391121`
**Commits:** `1e241c8` (implementation), `7c458bb` + `1b1ccf7` (test hardening / audit fixes)

Two parallel sub-agents (Standards + Spec) reviewed `git diff d41e3e8...HEAD` (12 files, +410/−90).

## Standards

**Hard violations:** none. No documented coding-standard violations; the engineering
workflow's requirements (design doc, typecheck/lint/guard, review evidence) are all met.

**Baseline smells (judgement calls):**
- *Duplicated Code* — the four ownership-history helpers
  (`insertProjectManagerOwnershipHistory`, `endActiveProjectManagerOwnershipHistory`,
  `insertWarehouseManagerOwnershipHistory`, `endActiveWarehouseManagerOwnershipHistory`)
  are byte-identical in `inmemory-workforce.repository.ts` and
  `inmemory-operations.repository.ts`; the diff retyped all copies (`any` → typed
  `Omit<...>` / `AuditSnapshot`) instead of unifying them. **Pre-existing duplication** —
  consolidating would be a separate refactor beyond issue #200's three items.
- *Duplicated Code* — the end-transition record shape
  `{ ...cur, status: "ENDED" as const, endDate, notes, actorUserId, actorLabel, transactionId, updatedAt: now() }`
  recurs in 5 places (workforce ×3, operations ×2) plus a `"VOIDED"` sibling in finance.
  The `as const` was required for assignability against the newly typed Maps.
- *Middle Man* — `InMemoryCompanyRepository` is a ~60-method delegation facade
  (pre-existing); the diff improved it by replacing `any` with
  `Parameters<CompanyRepository["method"]>[0|1]`.
- *Data Clumps* (weak) — `actorUserId/actorLabel/transactionId` hand-spread per record;
  mitigated by the shared `AuditSnapshot`/`normalizeAudit` helpers.
- Minor style divergence: the ownership-history `endActive*` loops emit bare
  `status: "ENDED"` (no `as const`) — they compile because a trailing audit spread
  preserves the literal. Correctness unaffected.

**Residual risks (noted, accepted):**
- `upsertEmployee` narrows via `data as { id?: string }` casts (mirrors the SQLite
  sibling adapter).
- `AuthUserRecord`/`BootstrapStateRecord` mirror the `user` / `app_bootstrap_state`
  table shapes manually (divergence risk acknowledged in the type comments).

## Spec

**(a) Missing/partial:** none. All three items + all four acceptance criteria met:
1. All 17 Maps typed with record types; zero `\bany\b` tokens in the five in-memory
   adapter files; `as const` literals where typing surfaced literal widening;
   `AuthUserRecord`/`BootstrapStateRecord` added for the two tables without existing
   record types (verified against `schema-definitions.ts` DDL).
2. Optional 4th `config: AppConfig = createAppConfig()` param; the only production
   caller (`apps/api/src/index.ts`) is untouched.
3. Option (a) chosen — `z.string().transform(...)` + `ctx.addIssue` runs
   `normalizeBaseUrl`, so `appConfigSchema.parse` alone validates and normalizes;
   6 new schema-level tests.
4. Full suite 559/559 green.

**(b) Scope creep:** none material. Commits `7c458bb`/`1b1ccf7` are test-only
(env pinning, timeout hardening, split protocol/credentials/query tests, in-memory
status-transition round-trip) — all driven by the test audit.

**(c) Implemented-but-wrong:** none. Error-type change (plain `Error` → `ZodError`)
documented; `.toThrow(substring)` assertions still green. `endActiveStateHistory`
status semantics unchanged from baseline.

## Summary

- Standards: 0 hard violations; 2 pre-existing duplication smells (out of scope), 1
  pre-existing delegation facade, 1 weak data-clump. Worst: duplicated ownership-history
  helpers across two files (follow-up candidate).
- Spec: 0 findings on any axis.
