# Debate Evidence — Issue #263

**Head SHA**: `f7883036eaa027e8f7d317919d44ab61853d0701`
**Base SHA**: `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2`
**Tier**: High-assurance (RBAC / authorization validation)
**Date**: 2026-08

Critic + defender sub-agents reviewed `git diff bb144f3a...HEAD` plus the
issue, the design doc, the RBAC seeds, and the Slice-3 migration.

## Critic findings (abridged)

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| F1 | 6 | Design doc headline said "exactly admin/manager/viewer" while the helper also accepts legacy keys — incoherent decision statement | **Fixed** — design doc rewritten to state the union honestly (legacy keys are a documented, production-unreachable no-op) |
| F2 | 5 | Legacy-key acceptance exists to keep ~20 dead-domain lifecycle unit tests green; strict 3-key + harness rework would be "cleaner" | **Dismissed** — the alternative is the domain redesign itself: the lifecycle logic (`createManagerAssignment`, workplace assignment, sync-managed-*) requires legacy role keys, so a strict whitelist makes those tests impossible (they'd need deletion or the lifecycle redesign, tracked #338). The union is the scoped bridge. |
| F3 | 6 | `admin` is assignable via `employees:create` (held by `manager` role) — privilege-escalation question | **Deferred** — created #340 (product decision). Note: employees don't authenticate via role today (user_id login link is a separate change), so this mints no login account. |
| F4 | 4 | `isAssignableEmployeeRoleKey` name asserts assignability for keys that can't be assigned; `as string[]` casts | **Fixed** — renamed `isAcceptedEmployeeRoleKey`, Set-based typed implementation |
| F5 | 5 | Drift guard pins API↔seeds but not API↔UI form | **Partial** — critic's specific claim (`rbacRolesList` absent from web) was wrong (workspace-queries.ts:85). E2E create now selects a seeded role explicitly, exercising the form's role options. |
| F6 | 4 | E2E weaknesses: implicit role default; vacuous `isVisible` guard; salary symptom untested; serial coupling | **Fixed** — create test selects `مدير عمليات` explicitly; update test asserts the notes field unconditionally. Salary claim verified stale (conditional pair validation); unit tests cover the pair rules. |
| F7 | 3 | Dormant lifecycle debt (project/warehouse manager assignment dead for seeded employees) | **Deferred** — created #338 |
| F8 | 2 | Drift guard covers only one seed source | **Fixed** — drift guard now pins both `DEFAULT_ROLE_PERMISSIONS` and `roleSeeds` (schema-definitions) |
| F9 | 2 | Mechanical rename complete and behavior-neutral | No action |
| F10 | 2 | Error message "only system roles" slightly imprecise for legacy keys | Dismissed — message remains accurate for every reachable case (legacy keys cannot exist in production) |

## Defender highlights

- Role decision matches seeds by construction (`role-seeds.ts`); drift guard is strict-equality against the live seed source; rename complete (zero `SYSTEM_ROLE_KEYS` references — TypeScript enforced it).
- Const split encodes two genuinely different concepts; comments record *why* the legacy set is preserved verbatim.
- Conservative scope on a high-assurance RBAC path is correct; the diff is a pure mechanical substitution for the lifecycle.
- New tests 8/8 + existing company tests 49/49 passed; E2E un-skipped with hardened selectors.

## Synthesis

No blocker. Fixed: F1 (design-doc honesty), F4 (naming/typing), F6 (E2E
robustness), F8 (dual-source drift guard). Deferred with issues: F3 → #340,
F7 → #338. Dismissed: F2 (strict-whitelist alternative == the #338 redesign;
union is the scoped bridge), F9/F10.

## Verification after fixes

- `pnpm --filter @tuari/api test`: 1064 passed
- `pnpm typecheck`: 4 tasks passed
- `pnpm lint`: passed
- `pnpm test:web`: 476 passed
- E2E `tests/e2e/employees.spec.ts`: 2 passed

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
