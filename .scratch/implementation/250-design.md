# Issue #250 — Coverage 100%: auth + rbac modules (high-assurance, security)

## Context

Part of #248 (coverage enforcement + failure-mode testing policy). The API vitest
config (`apps/api/vitest.config.ts`) already enforces 100% thresholds but only on
`workforce/**`, `invoice/**`, and `auth/**`. The rbac module was unmeasured even
though it is security-sensitive (permission resolution feeds session payloads).

`origin/develop` was fast-forwarded into the branch first (`fd94c41`, refactor #209)
so the rbac storage adapters live under `adapters/` — the coverage `exclude`
(`**/adapters/**/*.ts`) then correctly exempts adapters from the threshold, keeping
the "adapters are exercised through module tests" policy intact.

## Tier

**High-assurance** (auth/RBAC — authorization, security-sensitive).

## Scope

1. Add `src/modules/rbac/**/*.ts` to the vitest coverage `include` (auth already
   included via #226/#233).
2. Reach honest 100% on both modules — verified empirically: 267/267 statements,
   152/152 branches, 61/61 functions, 237/237 lines after the include change.
3. Add security edge-case tests so the 100% is not happy-path-only:
   - whitespace / zero-width (format-char) inputs in the auth module
     (edge taxonomy from #226/#230/#234)
   - unknown / stale / whitespace-padded permission strings in the rbac module
     (edge taxonomy from #210)
4. `pnpm typecheck && pnpm test:api && pnpm lint` green.

## Out of scope (deliberate)

- #230 (reject whitespace-only passwords in the shared credential schema) and #234
  (reject `\p{Cf}` format chars in recovery/DB-key input schemas) are separate OPEN
  issues with wire-contract blast radius (sign-in + web pre-validation copy). #250
  only pins the **current** defense-in-depth rejection boundaries with tests; the
  schema hardening stays tracked in those issues.
- #210 itself (session.service edges, bootstrap-error propagation in the resolver
  port) is its own OPEN issue; #250 pins the resolver's pass-through semantics and
  `ALL_PERMISSIONS` copy isolation inside the rbac module only.

## Changes

| File | Change |
|---|---|
| `apps/api/vitest.config.ts` | add `src/modules/rbac/**/*.ts` to coverage `include` |
| `apps/api/src/modules/auth/bootstrap.service.test.ts` | phone with embedded zero-width char → VALIDATION |
| `apps/api/src/modules/auth/recovery-key.service.test.ts` | ZWSP key / padded key never consume (exact-hash pin) |
| `apps/api/src/modules/rbac/permissions.test.ts` | whitespace/format-char permission strings → invalid |
| `apps/api/src/modules/rbac/adapters/sqlite-permission-resolver.test.ts` | stale-permission pass-through, ALL_PERMISSIONS copy isolation, empty userId |
| `apps/api/src/modules/rbac/role-seeds.test.ts` | `getPermissionsForRole` returns a fresh copy |

## Tests

- Unit tests via `pnpm --filter @tuari/api test` (vitest) — all additions are
  behavior-pinning (assert current rejection / pass-through semantics).
- No Playwright E2E additions: this issue changes no user-facing flow; the
  recovery-key flow already has a full `recovery-key.e2e.test.ts` lifecycle test.

## Risks

- **Pinning a future fix**: a test asserting ZWSP keys never consume would break if
  #234 later adds a `\p{Cf}` rejection at the wire (the service would then never see
  such a key — test stays green, just redundant). Acceptable; the tests document the
  seam.
- **Coverage gate creep**: `test-helpers/recovery-key-env.ts` matches the `auth/**`
  glob and is measured (100% today). New unused helper code would trip the gate —
  acceptable hygiene.

## Verification

- `pnpm --filter @tuari/contracts build`
- `pnpm --filter @tuari/api test:coverage` (thresholds 100%)
- `pnpm typecheck && pnpm test:api && pnpm lint` (root)
