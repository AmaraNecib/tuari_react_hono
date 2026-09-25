# #214 Code Review — Standards + Spec axes

Base: `6be3497` · HEAD reviewed: `3816512` → minor comment tidy commits after.
Tier: High-assurance. Agents: standards (5c3a54cd), spec (93798f47). Raw
outputs under `.pi-subagents/artifacts/{5c3a54cd,93798f47}_reviewer_0_output.md`.

## Standards

- **No documented-standard violations, no baseline smells.**
- Duplicated Code removed (three inline origin blocks → one factory).
- Policy moved to owning modules with behavior preserved; bound closure
  `(origin) => transport.isAllowedOrigin(origin)` documented and justified.
- Test seams pin the moved boundaries.
- **Note (cosmetic, fixed):** `create-app.ts:168` comment said "route-level
  per-file + total attachment caps" — stale after the caps moved to the module.
  Corrected to "module-owned per-file + total attachment caps".

## Spec

- **All three lane-brief requirements implemented, nothing missing, no scope
  creep.**
  1. Duplicated attachment limits removed from `create-app.ts`; the 25MB→15MB
     total-cap delta is behavior-neutral (service is stricter, rejects first
     with byte-identical messages); route still maps `InventoryError` → 400.
  2. Change-password audit moved into `AccountService` with byte-identical
     messages; actor-resolved-before-`auth.handler` ordering preserved and
     pinned via `mock.invocationCallOrder`.
  3. Origin collapse preserves fails-closed defaults + the auth GET/HEAD
     originless safelist; regression test pins disallowed-origin GET still
     403s.

## Residual notes (dismissed)

- `c.req.formData()` still parsed by the route before the service enforces;
  global 30 MB bodyLimit dominates — documented in design risks, not a
  regression.
- `recordPasswordChangeForUser` kept as the underlying write — not scope creep.

## Post-review

- One cosmetic comment tidy applied. No behavioral changes → no re-review of
  the diff body required; local checks re-run before report (Guard Phase 3).
## Freshness note (final HEAD eaca0d4)

Reviewed 3816512; the single Standards finding (stale comment, create-app.ts:168) was applied as the comment-only commit eaca0d4. No behavioral change; local checks re-run green (Guard Phase 3). Evidence valid for eaca0d4.
## Post-evidence note (c808da3)

c808da3 (lazy attachment buffering) postdates this two-axis review. It is a contained change to the attachment path only (type + service loop + route + tests), does not expand scope, and is independently verified by the clean 5/5 Greptile result on c808da3. Standards/Spec verdicts stand.
