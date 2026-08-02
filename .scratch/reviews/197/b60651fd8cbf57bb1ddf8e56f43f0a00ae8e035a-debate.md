# Debate — Adversarial Review (#197)

**Issue:** #197 — Extract PermissionResolverPort from SqlitePermissionResolver
**Tier:** High-assurance (RBAC/permissions)
**Base SHA:** `80d4926f029c3facee7dd17eb28da174c6e01f3b`
**Head SHA:** `dafc219e70d103235a6735dc05280b4fdb2de5eb`
**Date:** 2026-08-03

Critic (reviewer) + Defender (delegate) ran in parallel against
`git diff 80d4926...dafc219 -- apps/` + design doc + issue spec.

## Critic findings

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| 1 | Adapter never declares `implements PermissionResolverPort`; seam is only structurally enforced at the single composition site | 4 | `adapters/sqlite-permission-resolver.ts:22` |
| 2 | Intra-module placement inconsistency: `sqlite-role.repository.ts` / `role.module.ts` remain at rbac root while the new adapter sits in `adapters/` | 3 | rbac module root |
| 3 | `permission-resolver.types.ts` naming vs repo convention (`*.port.ts`, `*.interface.ts`) — issue spec explicitly mandates `permission-resolver.types.ts` | 2 | filename |
| 4 | Residual raw-handle union + force-cast in constructor (pre-existing, verbatim move) — the #191 leakage target | 2 | constructor |

**Blocker: none.** Critic: "genuinely clean, spec-compliant structural refactor; no behavior change, no test-logic edits, all imports updated, unused `Permission` import correctly dropped."

## Defender highlights

- Port is the smallest possible contract (one method, reuses `Permission` domain type) — no speculative generality (confidence 10).
- SessionService swap is type-equivalent to the deleted inline structural type; mock tests pass unchanged (confidence 9–10).
- Adapter move is a faithful, convention-following relocation; body verbatim (confidence 9).
- Composition-root wiring preserved in substance (confidence 9).

## Synthesis & decisions

| Finding | Decision | Action |
|---------|----------|--------|
| 1 | **Fixed** | Added `implements PermissionResolverPort` (type-only import) — commit `dafc219` |
| 2 | **Deferred** | Follow-up issue **#209** (RBAC layout alignment) |
| 3 | **Dismissed** | Spec-mandated filename; noted in PR |
| 4 | **Deferred** | Follow-up issue **#209** (drop raw-handle constructor mode) |

## Verification after fix

- `tsc --noEmit` exit 0
- rbac + session unit suites: 44/44 pass
- Full `pnpm test:api` (601 tests) and `pnpm test:web` (341 tests) pass

---

## Post-evidence delta (dafc219 → b60651f)

Re-SHA'd to final HEAD `b60651f`. Delta after this review: commit `b60651f`
removed the unused `import type { Permission }` from the moved adapter test
(test-audit finding; no behavior change) and committed the evidence files.
No reviewable logic changed since `dafc219`.
