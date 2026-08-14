# Code Review Evidence — Issue #263

**Head SHA**: `64a735808b029fb76f606b81980e8e92f91bbcdf`
**Base SHA**: `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2`
**Tier**: High-assurance
**Date**: 2026-08

Two parallel sub-agents (Standards + Spec) reviewed `git diff bb144f3a...HEAD`
(5 commits, 12 files) against the repo's documented standards + Fowler smell
baseline, and against issue #263 + the design doc.

## Standards

No hard violations. Conforms:
- Design-first workflow (design doc present, unit + E2E tests, evidence
  committed with SHA-tracked filenames).
- Rename complete (`grep SYSTEM_ROLE_KEYS apps/api/src` → nothing).
- Assignable set matches both seed sources by construction; drift guards
  pin both; E2E `selectOption` label matches the seeded manager name.
- New predicate removes the previously duplicated inline check.
- Legacy-key preservation documented (JSDoc + design + follow-ups #338/#340).
- E2E hardening follows wisdom/testing.md (unconditional assertions).

Judgement calls only: dual-source drift guard (intentional), dormant
lifecycle preserved verbatim (not adapted — Refused Bequest/Speculative
Generality don't apply), mutable-but-private Set (matches repo pragmatism).

## Spec

(a) Missing/partial — **none**. All three issue asks implemented: assignable
set, gated create/update/batch, un-skipped E2E.
(b) Scope creep — all documented and justified: phone-trim duplicate guard
(defense-in-depth, no-op today since the wire schema trims), E2E hardening
(debate F6), review artifacts.
(c) Looks wrong — no functional defect. Watch items noted and already
decided: union acceptance of legacy keys (documented no-op), dormant
transition guards (follow-up #338), message accuracy for reachable inputs.

## Verdict

**No actionable findings on either axis.** Safe to push.

## Post-evidence delta (Greptile P1 fix)

**Delta SHA**: `71cd5f7` — fix(api): gate admin role assignment behind the admin grant (part of #263)

**Delta files**: `apps/api/src/modules/company/company.entity-resolvers.ts`,
`apps/api/src/modules/company/workforce.service.ts`,
`apps/api/src/modules/company/workspace-mutation-context.ts`,
`apps/api/src/modules/company/company.test-helpers.ts`,
`apps/api/src/modules/company/company.role-assignability.test.ts`,
`.scratch/implementation/263-design.md`.

Narrow, security-focused delta applied **after** this evidence was gathered:

- Greptile P1: `requireAssignableEmployeeRole` accepted the `admin` role for
  any caller holding `employees:create` (the `manager` role), letting a
  lesser grant mint an `admin` employee whose phone-linked account would
  inherit every admin permission.
- Fix (Direction 1, caller-grant check): `requireAssignableEmployeeRole` now
  takes an optional `caller` (`{ authorizer, actorUserId }`) and enforces
  `requireAdminAssignmentGrant` — the `admin` role may only be assigned by a
  caller holding the admin-level grant (bootstrap owner per
  `WorkspaceAdminAuthorizer.isBootstrapOwner`); everyone else gets
  UNAUTHORIZED. The gate fails closed (no authorizer/actor ⇒ no grant).
- Batch-create applies the same rule per row and throws UNAUTHORIZED
  atomically (nothing persists). `manager`/`viewer` and legacy keys unchanged.
- `WorkspaceMutationContext` exposes the authorizer via a getter; the guard
  stays a pure resolver function. Harness accepts an optional authorizer.
- Tests: 9 tests added/re-pinned in `company.role-assignability.test.ts`
  (resolver-level manager-reject / owner-accept / fail-closed; service-level
  create/update/batch manager-reject and admin-holder-accept).

This delta is a single new guard whose behavior is pinned by the new tests;
the prior Standards/Spec conclusions for the reviewed surface are unaffected.
Re-verified after the delta: `pnpm typecheck`, `pnpm lint`, `pnpm test:api`
(1084 passed), `pnpm test:web` (476 passed), contracts build.
