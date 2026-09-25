# Code review — issue #35 (atomic employee save) — HEAD f10ee2d

Base: `842f6ea`. Diff: `git diff 842f6ea...f10ee2d` (commits `552317b`,
`f10ee2d`). Standard tier; two parallel axes (Standards + Spec).

## Standards axis

Documented rules verified: i18n keys wired in the same change ✓ (all three
`detailPages.employee.editPage.save*` keys referenced by the banner renderer);
tests resolve `t` against the real resource ✓ (`import "@/i18n"`, literal
Arabic assertions); AGENTS.md staging + scratch lifecycle ✓ (only
source/test/i18n + design doc committed); engineering-workflow design doc
present with pinned base, tier, tests, risks ✓; pre-await capture of pre-save
snapshots ✓.

Baseline smells (all judgement calls):
- **Duplicated Code (low)** — placement derivation exists twice (page init's
  four `useState(employee.current*Id ?? "")` vs `placementStateFromEmployee`).
  Deliberate mirror, pinned by the pure tests; a unification refactor is
  possible but not required → accepted.
- **Repeated Switches (low)** — the three-way `saveError` ternary in the banner
  renderer; single site, matches repo's inline-ternary style → accepted.
- **Primitive Obsession / typing (low)** — `preSavePlacement` context field now
  typed as the exported `PlacementState` (fixed in `f10ee2d`).
- **Mysterious Name / Speculative Generality / Feature Envy** — none.
- EOF newline on the three new files → fixed in `f10ee2d`.
- `as never` fixture casts in the page tests — matches the repo's existing
  `edit-page-resync.test.tsx` convention; literals are plausible; drift would be
  caught by typecheck-adjacent review → accepted (convention).

No blockers. No hard violations of documented standards.

## Spec axis

Spec: issue #35 brief (parent) + `.scratch/implementation/35-design.md`.

- (a) Missing/partial requirements: none. Multi-mutation flow detected (4
  sequential RPCs); option (b) compensating rollback implemented; the
  "rollback cannot fully restore" surface (`savePartialUnverified`) exists and
  is tested; #20 placement semantics byte-identical (`isWorker && status ===
  "ACTIVE" && workplaceChanged` gating untouched; non-active silently ignored —
  now pinned by a test).
- Minor gap vs the design doc's own test list (warehouse-manager RTL scenario,
  and the PM scenario claiming profile+workplace+managedProjects) → the
  warehouse-manager RTL test was added in `f10ee2d`; the PM scenario exercises
  profile+managedProjects (workplace is worker-only by role classification —
  a PM cannot have a workplace step, so the combination is structurally
  impossible in RTL and is covered at the pure-module level).
- (b) Scope creep: none meaningful. Banner + i18n keys serve the required error
  surface; `EmployeeProfile` narrowing required by `employeesGet` reconcile;
  dead `employee-edit-page-v2.tsx` correctly left untouched (zero importers).
- (c) Implemented but wrong: none. `computeSaveFailureRollback` per-step truth
  verified against `employeeSchema`; mutation hooks throw via
  `requireEntitySuccess`, so the `catch` path is reachable; the in-flight
  submit guard (added post-review) closes the second-submit window the spec
  reviewer noted.
- Notes accepted: reconcile-fetch input clobber window (documented residual);
  banner render is hand-rolled HTML (no earlier shared primitive exists;
  #38 LoadErrorSurface not depended on, per brief).

## Summary

- **Standards:** no hard violations; three low judgement-call smells accepted
  (duplicate derivation, ternary cascade, `as never` convention), two fixed.
- **Spec:** all requirements present and implemented; placement semantics
  preserved; scope creep none.

Both axes clean at `f10ee2d`.
## Post-evidence note

Pinned at code HEAD `04a9b71` (EOF-newline commit only; no behavior change since the review tree). Gates re-run at this SHA before push.
