# Code Review — #236 (workspace data layer, one query-key seam)

Head: `98c261d` · Base: `bb49ec2` · Axis: two-agent (Standards + Spec)

## Standards

**Documented-standard violations: none.** No zod output schemas, typed Maps,
service boundaries, Rust, or RBAC touched. Engineering-workflow lifecycle
requirements met (design doc, unit + E2E tests). `requireEntitySuccess` copies
left untouched (correctly — #240 scope).

Judgement calls (non-blocking):
- Two-helper invalidation split (`invalidateWorkspaceDomains` record-many vs
  `invalidateUserScopedQuery` closure-one) is coherent; naming nit only.
- `WorkspaceDomain` arity derivation's `as (userId: string)` cast is
  justified-by-construction and pinned by the flat-set test.
- Mild duplication: `const userId = getCachedSessionUserId(qc)` + paired
  `invalidateUserScopedQuery` calls repeat in 3 inventory mutations — a
  multi-key helper would be speculative; left as-is.
- `use-phone-sign-in-mutation.ts` (auth) importing `sessionQueryKey` from
  app-shell: mild feature inversion, no cycle, no documented standard.

## Spec

Done-when: (1) decision (a) recorded with invalidation interface shape ✓;
(2) one key namespace per endpoint, type-checked invalidation, no string
literal mirror ✓ (zero `inventoryKeys`/`workspaceDomainQueryKeys`/`["inventory",`
references remain); (3) every hook consumes the factory, gate lives once
(one `Boolean(sessionQuery.data?.user)` left in src, via the wrapper) ✓;
(4) typecheck/test/lint green ✓.

Findings:
- E2E `warehouses.spec.ts` fresh-boot assertion pins shared key/endpoint
  coupling, not the create-mutation invalidation seam (page.goto wipes the
  cache). Accepted as designed — comment rewritten honestly; the invalidation
  seam is pinned by the unit integration tests (`inventory-hooks.test.tsx`,
  `employee-debt-hooks.test.tsx`, `workspace-keys.test.ts`).
- `use-phone-sign-in-mutation.ts` `orpc.session.key()` → `sessionQueryKey` was
  not in the original design; same no-op-invalidation bug class as the in-scope
  sign-out/account-settings fixes. Documented as a 1-line scope addition in the
  design doc. Flagged, accepted.
- `workspace-mutations.test.ts` has no domains-record call tests — cosmetic,
  not a done-when.
- Implemented-but-wrong: none.

## Summary

- Standards: 0 hard violations, 5 judgement calls (all minor/non-blocking).
  Worst: the two-helper naming nuance.
- Spec: 0 missing requirements; 2 flagged items (E2E seam-pinning scope,
  phone-sign-in doc) — both accepted with documentation.
